# Guía de despliegue — Backend de cotizaciones (VPS Hostinger)

Backend Fastify + Puppeteer que genera el PDF de cotización, lo sube a R2 y
devuelve el URL. La card de HubSpot lo invoca por HTTPS.

## Datos del servidor (auditados)

- Ruta del proyecto: `/opt/smartflow/Construtecho_Quotes`
- Puerto del backend: **3003**, bindeado a **`127.0.0.1`** (solo nginx lo alcanza)
- Puertos ya ocupados (no tocar): 22, 80, 443, 3000, 3001, 3002, 32769, 32770
- Stack aislado: contenedor `construtecho-quotes`, red propia de compose. No usa
  Mongo ni toca los contenedores existentes.
- No requiere base de datos.

---

## Fase 2 — Levantar el backend en el VPS

### 2.1 (En tu máquina) Mergear a main y subir
El `.env` NO se sube (está en `.gitignore`). Desde el repo local:
```bash
git checkout main
git pull origin main
git merge dfer/new-feature
git push origin main
```

### 2.2 (En el VPS) Clonar en la ruta del proyecto
```bash
cd /opt/smartflow/Construtecho_Quotes
git clone git@github.com:smarteam-cr/smarflow-quotes.git .
```
`main` es la rama por defecto, así que queda lista tras el clone.
**Comprobación:** `ls` debe mostrar `Dockerfile`, `docker-compose.yml`, `src/`, `package.json`; `git branch --show-current` → `main`.

### 2.3 (En el VPS) Crear el `.env` de producción
```bash
nano /opt/smartflow/Construtecho_Quotes/.env
```
Contenido (reemplaza el token por el del **HubSpot del cliente**, Fase 4; R2 es
el bucket del cliente y no cambia):
```
HUBSPOT_ACCESS_TOKEN=<TOKEN_PRIVATE_APP_DEL_CLIENTE>
URL_PUBLIC_dEV=https://pub-c0dfb6011dd9450b8d82d12460e4ea7f.r2.dev
ACCOUNT_ID=308957d51f63f9d0ad160a319422496b
S3_API=https://308957d51f63f9d0ad160a319422496b.r2.cloudflarestorage.com
BUCKET_NAME=hs-quotes-construtecho
R2_ACCESS_KEY_ID=<R2_ACCESS_KEY>
R2_SECRET_ACCESS_KEY=<R2_SECRET>
```
**Comprobación:** `cat .env` muestra las 7 variables. Permisos: `chmod 600 .env`.

### 2.4 (En el VPS) Construir y levantar
```bash
cd /opt/smartflow/Construtecho_Quotes
docker compose build
docker compose up -d
```
**Esperado:** build sin errores; `Started construtecho-quotes`.

### 2.5 (En el VPS) Comprobar que está sano
```bash
docker compose ps
docker compose logs --tail=30
curl -s http://127.0.0.1:3003/health
```
**Esperado:**
- `docker compose ps` → estado `Up`.
- logs → `Server listening at http://0.0.0.0:3000` (y `MONGO_URL is not set` es normal).
- `curl /health` → `{"status":"ok","version":"0.1.0"}`.

### 2.6 (En el VPS) Probar la generación real (con un deal real)
```bash
curl -s -X POST http://127.0.0.1:3003/deals/send-quote \
  -H "Content-Type: application/json" \
  -d '{"dealId":"<DEAL_ID_REAL>"}'
```
**Esperado:** JSON con `pdf.url` apuntando a R2. (Requiere que el token del `.env`
ya sea el del cliente y que sus scopes estén concedidos.)

> Checkpoint: hasta aquí el backend corre y genera PDFs **internamente**. Solo
> después de que esto esté verde pasamos a exponerlo con nginx (Fase 3).

---

## Fase 3 — HTTPS con nginx (requiere subdominio)

> **AQUÍ necesitas el subdominio.** Pídeselo a quien maneja el DNS: un registro
> **A** apuntando a la IP del VPS, p. ej. `cotizaciones.smarteamcr.com`.

### 3.1 Crear el server block (sin tocar los existentes)
```bash
nano /etc/nginx/conf.d/construtecho.conf
```
```nginx
server {
    listen 80;
    server_name cotizaciones.smarteamcr.com;   # <-- tu subdominio

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;   # la generación del PDF puede tardar varios segundos
    }
}
```
### 3.2 Validar y recargar nginx (no afecta otros sitios)
```bash
nginx -t
systemctl reload nginx
```
**Esperado:** `nginx: configuration file ... test is successful`.

### 3.3 Emitir el certificado TLS (Let's Encrypt)
```bash
certbot --nginx -d cotizaciones.smarteamcr.com
```
**Esperado:** certbot configura el bloque `443` automáticamente y redirige 80→443.
**Comprobación:** `curl -s https://cotizaciones.smarteamcr.com/health` → `{"status":"ok",...}`.

---

## Fase 4 — Card en el HubSpot del cliente

### 4.1 Crear/obtener el token de la private app del cliente
La private app se define en `src/app/app-hsmeta.json`. Al subir el proyecto a la
cuenta del cliente (4.4) se crea/actualiza. Toma su **access token** desde
HubSpot → Settings → Integrations → Private Apps → (la app) → Auth, y ponlo en el
`.env` del VPS (paso 2.3) y `docker compose up -d` de nuevo. Asegúrate de que los
scopes estén concedidos (incl. `crm.objects.quotes.read`, `crm.objects.owners.read`,
`account-info.security.read`).

### 4.2 Apuntar la card al backend de producción
En el repo, cambiar el URL del túnel por el subdominio en DOS lugares:
- `src/app/cards/send-quote-app-card.tsx` → `API_BASE_URL`
- `src/app/app-hsmeta.json` → `config.permittedUrls.fetch`

de la URL de túnel actual (`API_BASE_URL`, hoy un `*.ngrok-free.dev`) a
`https://cotizaciones.smarteamcr.com` (tu subdominio de producción).

### 4.3 Autenticar el CLI a la cuenta del cliente
```bash
hs auth
```
(Sigue el flujo del navegador / personal access key de la cuenta del cliente.)
Verifica con `hs account list`.

### 4.4 Subir el proyecto
```bash
hs project upload
```
> Confirma el subcomando exacto con `hs project --help` (varía por versión del CLI).

---

## Fase 5 — Verificación end-to-end

1. Abre un Deal real en el HubSpot del cliente.
2. Pestaña "Enviar Cotización" → botón.
3. Debe responder con éxito y generarse el PDF en R2.
4. Confirma que el URL quedó guardado en la propiedad `url_de_la_ultima_cotizacion`
   del deal.

---

## Operación

- Ver logs: `docker compose logs -f` (en la ruta del proyecto).
- Reiniciar: `docker compose restart`.
- Actualizar tras un cambio: `git pull && docker compose up -d --build`.
- Detener (solo este stack): `docker compose down`.
- Estado: `docker compose ps`.
