# Smartquotes

Genera **cotizaciones en PDF** a partir de un **Deal (negocio) de HubSpot**. El asesor abre un
deal, presiona **"Crear Cotización"** en una card del panel lateral, y el sistema arma un PDF con
los datos del deal y sus asociaciones, lo sube a **Cloudflare R2** y devuelve el URL público. El
URL también se guarda en el deal (propiedad `url_de_la_ultima_cotizacion`).

> **Estado: en producción** para el cliente Construtecho. El branding interno es genérico
> ("Smartquotes") porque está pensado para poder volverse multi-tenant (SaaS) en el futuro.

**No usa base de datos.** El único estado persistente es el URL guardado en el propio deal.

### Documentación
- **[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)** — cómo está armado: piezas, flujo, estructura del código, servicios externos y mapeo de campos PDF↔HubSpot.
- **[docs/ENTREGA.md](docs/ENTREGA.md)** — entrega y operación: repositorio, despliegue, ambientes, dependencias con terceros, pendientes, riesgos e incidencias conocidas.
- **[CLAUDE.md](CLAUDE.md)** — reglas para trabajar con los componentes de HubSpot del proyecto.

---

## Stack

- **Backend:** Node 24, [Fastify 5](https://fastify.dev), [Puppeteer](https://pptr.dev) (Chromium del sistema), [@hubspot/api-client](https://www.npmjs.com/package/@hubspot/api-client), AWS S3 SDK (contra Cloudflare R2).
- **Card:** React + [@hubspot/ui-extensions](https://developers.hubspot.com/docs/platform/ui-extensions), desplegada con la HubSpot CLI (`hs`). Platform version `2026.03` (ver `hsproject.json`).
- **Infra:** Docker / docker-compose, detrás de nginx (TLS) en un VPS.

Son **dos piezas con dos despliegues independientes** (el backend y la card). El detalle está en
[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

---

## Requisitos previos

- **Node 24+** y npm.
- Un archivo **`.env`** en la raíz (ver [Variables de entorno](#variables-de-entorno)). Plantilla: `.env.example`.
- Para la card: **[HubSpot CLI](https://www.npmjs.com/package/@hubspot/cli)** (`hs`) autenticada en una cuenta con acceso a developer projects.

---

## Instalación y ejecución local

### Backend
```bash
npm install
npm run dev:api        # node --watch src/server.js (recarga al guardar)
# o sin watch:
npm run start:api
```
El servidor escucha en `HOST:PORT` (default `0.0.0.0:3000`). Verifica que está vivo:
```bash
curl -s http://localhost:3000/health
```
Generar una cotización real (requiere `.env` con token y R2 válidos, y un deal con sus asociaciones):
```bash
curl -s -X POST http://localhost:3000/deals/send-quote \
  -H "Content-Type: application/json" -d '{"dealId":"<DEAL_ID_REAL>"}'
```

> Puppeteer usa el Chromium del sistema en producción (Docker). En local descarga su propio Chromium
> al instalar, salvo que definas `PUPPETEER_SKIP_DOWNLOAD` / `PUPPETEER_EXECUTABLE_PATH` (ver `Dockerfile`).

### Card (UI extension)
La card se itera y despliega con la HubSpot CLI, **no** con npm:
```bash
hs project dev        # desarrollo local con recarga en el portal
hs project upload     # subir/publicar la card a la cuenta de HubSpot
```
La card llama al backend en `API_BASE_URL` (en [`send-quote-app-card.tsx`](src/app/cards/send-quote-app-card.tsx)).
Para apuntarla a un backend local, expón tu backend con un túnel HTTPS (p. ej. ngrok) y pon esa URL
tanto en `API_BASE_URL` como en `config.permittedUrls.fetch` de `src/app/app-hsmeta.json` (HubSpot
solo permite `hubspot.fetch` a URLs declaradas ahí).

### Tests
```bash
npm test              # node --test
```
Cubren las funciones puras y utilidades (view model, formato, asociaciones, plantilla, sucursal,
`sistema`, pdf-key, semáforo de concurrencia). El repository y el service se validan con integración manual.

---

## Variables de entorno

`src/config/env.js` acepta varios alias por variable (por compatibilidad). Lo esencial:

| Propósito | Variable(s) | Notas |
|-----------|-------------|-------|
| Token HubSpot | `HUBSPOT_ACCESS_TOKEN` (o `HUBSPOT_PRIVATE_APP_TOKEN`) | private app del **cliente** en producción |
| R2 URL pública | `URL_PUBLIC_dEV` (o `URL_PUBLIC_DEV` / `R2_PUBLIC_URL`) | base del URL público del PDF |
| R2 account / endpoint | `ACCOUNT_ID` (o `R2_ACCOUNT_ID`), `S3_API` (o `R2_S3_API`) | el endpoint se deriva del account si no se da |
| R2 bucket | `BUCKET_NAME` (o `R2_BUCKET_NAME`) | |
| R2 credenciales | `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` (o `CLOUDFLARE_R2_*`) | **secretas** — nunca commitear |
| Concurrencia de PDF | `PDF_MAX_CONCURRENCY` | renders simultáneos máximos (default `2`) |
| Mongo (opcional) | `MONGO_URL`, `MONGO_DB_NAME` | solo logging; sin `MONGO_URL` se desactiva |
| Servidor | `HOST`, `PORT`, `NODE_ENV` | default `0.0.0.0:3000` |

`.env` está en `.gitignore` y **nunca** se commitea; en el VPS se crea a mano. `.env.example` solo
trae la forma de las variables, sin valores reales.

---

## Despliegue (resumen)

Producción corre la rama `main` en un contenedor Docker (`construtecho-quotes`) detrás de nginx
(`https://smartquotes.smarteamcr.com` → `127.0.0.1:3003`). Para actualizar el backend:
```bash
git pull && docker compose up -d --build
```
La guía completa (VPS, nginx, TLS, scopes, card y ambientes) está en **[docs/ENTREGA.md](docs/ENTREGA.md)**.
