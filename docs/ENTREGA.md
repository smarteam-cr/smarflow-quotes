# Entrega y operación — Smartquotes

Documento de **handoff**: qué se entrega, cómo está montado en producción, de qué terceros depende,
qué falta y qué riesgos hay. Para entender el código ver [ARQUITECTURA.md](ARQUITECTURA.md); para
instalar y correr en local, el [README](../README.md).

> Última actualización: 2026-06-16.

---

## 1. Repositorio entregado

| Proyecto | Repositorio | Rama | Estado |
|----------|-------------|------|--------|
| Smartquotes (backend + card) | `git@github.com:smarteam-cr/smarflow-quotes.git` | `main` | **En producción** (Construtecho) |

El repositorio contiene todo en un solo lugar: backend (`src/`), card de HubSpot (`src/app/`),
infraestructura (`Dockerfile`, `docker-compose.yml`), configuración (`.env.example`, `hsproject.json`)
y documentación (`docs/`). El working tree está limpio y subido: **no hay cambios solo en local**.

---

## 2. Ambientes

| Ambiente | Dónde | Notas |
|----------|-------|-------|
| **Local (dev)** | Máquina del desarrollador | Backend con `npm run dev:api`; card con `hs project dev`. Requiere `.env` propio. |
| **Producción** | VPS Hostinger | Backend en Docker; card publicada en el portal de HubSpot del cliente. |

No hay ambiente de *staging* dedicado; las pruebas previas a producción se hacen en local contra un
deal real (con un túnel HTTPS para la card si se necesita). El **número de cotización** lo administra
HubSpot, así que probar en local con un deal real puede consumir numeración real.

### Producción (cómo está montado)

| Aspecto | Valor |
|---------|-------|
| Backend (URL pública) | `https://smartquotes.smarteamcr.com` (nginx → TLS → `127.0.0.1:3003`) |
| Servidor | VPS Hostinger, Debian 13, Docker. Ruta: `/opt/smartflow/Construtecho_Quotes` |
| Contenedor | `construtecho-quotes` (compose), puerto **`127.0.0.1:3003`** (solo localhost) |
| Reverse proxy | nginx (`conf.d`), server block propio; el resto de proyectos del server queda intacto |
| Almacenamiento | Cloudflare R2, bucket `hs-quotes-construtecho` (del cliente, lo administramos nosotros) |
| Card URL (`API_BASE_URL`) | `https://smartquotes.smarteamcr.com` (en `send-quote-app-card.tsx` y `permittedUrls.fetch`) |
| Healthcheck | `GET /health` → status, service, version, timestamp, uptime, checks (hubspot/r2). El compose lo sondea cada 5 min (marca healthy/unhealthy; es diagnóstico, **no** auto-reinicia) |

---

## 3. Despliegue

### Backend (VPS, Docker)

**Actualizar** tras un cambio en el backend (no requiere tocar la card):
```bash
cd /opt/smartflow/Construtecho_Quotes
git pull
docker compose up -d --build
```

**Operación diaria:**
```bash
docker compose ps          # estado (Up / healthy)
docker compose logs -f     # ver logs
docker compose restart     # reiniciar
docker compose down        # detener solo este stack
```

**Comprobar que está sano:**
```bash
curl -s http://127.0.0.1:3003/health
# Esperado: status "ok" y checks { hubspot: true, r2: true }
```

**Montaje desde cero (resumen):**
1. Clonar el repo en `/opt/smartflow/Construtecho_Quotes` (rama `main`).
2. Crear el `.env` a mano (ver §4); `chmod 600 .env`. **No se commitea.**
3. `docker compose build && docker compose up -d`.
4. Verificar `/health` y luego una generación real (`POST /deals/send-quote` con un deal real).
5. Exponer con nginx + TLS (Let's Encrypt / certbot) en el subdominio. El puerto del backend queda
   en `127.0.0.1` y solo nginx lo alcanza; usar `proxy_read_timeout 120s` (el PDF puede tardar varios segundos).

### Card (HubSpot)

La card es un despliegue **aparte**:
```bash
hs auth                 # autenticar el CLI a la cuenta del cliente
hs project upload       # subir/publicar la card
```
Antes de subir, `API_BASE_URL` (en `send-quote-app-card.tsx`) y `config.permittedUrls.fetch`
(en `app-hsmeta.json`) deben apuntar al backend de producción. Los **scopes** de la private app
deben estar concedidos (ver [ARQUITECTURA.md §9](ARQUITECTURA.md#9-scopes-de-hubspot-private-app-del-cliente)).

---

## 4. Variables de entorno en producción

El `.env` se crea a mano en el VPS y **no** está en el repo. Forma (los valores reales viven en el
gestor de contraseñas del equipo y en el `.env` del VPS, nunca aquí):

```
HUBSPOT_ACCESS_TOKEN=<token de la private app del CLIENTE>
URL_PUBLIC_dEV=<URL pública del bucket R2>
ACCOUNT_ID=<Cloudflare account id>
S3_API=<endpoint S3 de R2>
BUCKET_NAME=<bucket del cliente>
R2_ACCESS_KEY_ID=<llave R2>
R2_SECRET_ACCESS_KEY=<secreto R2>
```

El detalle de cada variable y sus alias está en el [README](../README.md#variables-de-entorno).
El token **debe ser el de la private app del cliente** y el bucket R2 es del cliente.

---

## 5. Dependencias con terceros

| Tercero | Rol | Quién lo administra | Si se cae / cambia |
|---------|-----|---------------------|--------------------|
| **HubSpot** | CRM origen de datos y destino del URL; aloja la card | Cuenta del cliente; private app con scopes | Sin HubSpot no hay datos ni card. Cambios de propiedades o de scopes pueden romper el PDF. |
| **Cloudflare R2** | Almacena y sirve los PDF | Bucket del cliente, administrado por nosotros | Sin R2 no se puede subir/servir el PDF. |
| **VPS Hostinger** | Corre el backend (Docker) detrás de nginx | Nuestro | Caída del VPS = backend abajo = la card no genera. |
| **Let's Encrypt** | Certificado TLS del subdominio | certbot en el VPS (auto-renueva) | Si no renueva, el HTTPS falla; la card no alcanza el backend. |

Dependencias de software (npm): Fastify 5, Puppeteer 24, `@hubspot/api-client`, AWS S3 SDK,
`mongodb` (solo si se activa logging). Versiones exactas en `package.json` / `package-lock.json`.

---

## 6. Riesgos e incidencias conocidas

- **🔴 Credenciales de R2 expuestas en el historial de git.** `.env.example` se commiteó en su
  momento con las llaves reales de Cloudflare R2 (`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`), por lo
  que están en GitHub y en el historial. Ya se limpió el archivo (placeholders), pero **borrarlo no
  invalida la llave**: hay que **rotar las credenciales R2 en Cloudflare** y actualizar el `.env` del
  VPS. Acción pendiente y prioritaria.
- **PDFs públicos por URL.** Los PDF se sirven desde `*.r2.dev` con una key no adivinable, pero
  cualquiera con el URL puede abrirlos. Si se requiere privacidad → dominio propio para R2 y/o URLs
  firmadas con expiración (ver §7, B4).
- **Endurecimiento de concurrencia: aplicado en código, falta desplegar.** El semáforo de render, la
  key de R2 con entropía y el healthcheck del compose ya están en `main`. Falta correr
  `git pull && docker compose up -d --build` en el VPS para que tomen efecto.
- **El número de cotización es de HubSpot.** Probar generaciones reales (en local o producción) consume
  numeración real (`hs_quote_number`). Tenerlo en cuenta al hacer pruebas.
- **Precondición de `sistema`.** Las opciones del campo `sistema` del negocio deben **incluir** las de
  los productos (line items). Si falta una opción, la escritura de `sistema` falla y, por diseño
  (bloqueante), **no se genera el PDF**.
- **Coherencia del IVA por sucursal.** `sucursal-config.js` define solo la **etiqueta** del % de IVA en
  el PDF; el **monto** lo calcula HubSpot. Si se agrega/edita una sede hay que mantener ambos coherentes.
- **No cambiar el `uid`** de `app-hsmeta.json` ni de la card: rompe la identidad de la app en HubSpot.

---

## 7. Pendientes y mejoras sugeridas

### Pendiente operativo
- **Rotar las credenciales R2** (ver §6) y actualizar el `.env` del VPS.
- **Desplegar el endurecimiento de concurrencia** al VPS (`git pull && docker compose up -d --build`).

### Backlog de producto (frontend de la card)
- **B1 — Persistir el estado del card al recargar** *(frontend, sin backend)*. Al montar la card, leer
  `url_de_la_ultima_cotizacion` con `useCrmProperties` y, si existe, mostrar el link "Abrir cotización (PDF)".
  El dato ya se guarda; solo falta leerlo. Esfuerzo: bajo.
- **B2 — Botón "Crear nueva cotización" según estado** *(va con B1)*. Sin cotización → "Crear cotización";
  con cotización → mostrar el link + botón para regenerar (y refrescar el link).
- **B3 — (Opcional) Persistir la fecha de generación.** Crear propiedad de deal `fecha_ultima_cotizacion`
  y que el backend la escriba junto con el URL, para mostrar "Generada el…" al recargar. Esfuerzo: bajo.

### Mejoras a futuro
- **B4 — Privacidad de PDFs.** Dominio propio para R2 y/o URLs firmadas con expiración.
- **B5 — Auditoría / historial.** Activar el logging en Mongo (ya soportado, hoy desactivado).
- **B6 — Multi-tenant (SaaS).** Hoy hay un solo token/bucket por `.env`. Para multi-tenant habría que
  resolver credenciales por cuenta (token de HubSpot y/o R2 por tenant).

---

## 8. Documentación extra

- **[README.md](../README.md)** — qué es, instalación, ejecución local, variables de entorno.
- **[ARQUITECTURA.md](ARQUITECTURA.md)** — piezas, flujo, estructura del código, servicios externos, mapeo de campos y decisiones.
- **[CLAUDE.md](../CLAUDE.md)** — reglas para trabajar con los componentes de HubSpot del proyecto.
- **`docs/superpowers/specs/` y `plans/`** — specs y planes históricos por cambio (contexto de diseño, no necesario para operar).

### Notas para retomar
- **Card y backend son despliegues separados.** Cambios en `src/app/**` → `hs project upload`. Cambios
  en el backend → `git pull && docker compose up -d --build` en el VPS.
- **`src/app/dist/` es artefacto generado** (gitignored); no se edita a mano.
- **`.env` nunca se commitea**; en el VPS se crea a mano y el token de producción es el de la private
  app del **cliente**.
