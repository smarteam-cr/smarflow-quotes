# Smartquotes

Genera **cotizaciones en PDF** a partir de un **Deal (negocio) de HubSpot**. El asesor abre un
deal, presiona **"Crear Cotización"** en una card del panel lateral, y el sistema arma un PDF con
los datos del deal y sus asociaciones, lo sube a **Cloudflare R2** y devuelve el URL público. El
URL también se guarda en el deal (propiedad `url_de_la_ultima_cotizacion`).

> **Estado: en producción** para el cliente Construtecho. El branding interno es genérico
> ("Smartquotes") porque está pensado para poder volverse multi-tenant (SaaS) en el futuro.

Para el contexto profundo (decisiones y por qué, mapeo de campos PDF↔HubSpot, backlog y gotchas)
ver **[docs/ESTADO-Y-PENDIENTES.md](docs/ESTADO-Y-PENDIENTES.md)**. Para desplegar, **[docs/DEPLOY.md](docs/DEPLOY.md)**.

---

## Arquitectura: dos piezas, dos despliegues

```
┌─ Card de HubSpot (UI extension React) ─┐         ┌─ Backend Fastify + Puppeteer ──────────┐
│ "Crear Cotización" (panel lateral del  │         │ Lee datos del deal vía API de HubSpot  │
│  deal). Vive en el portal de HubSpot.  │ ──HTTPS▶ │ Arma HTML → PDF (Chromium headless)    │
│ Llama con hubspot.fetch().             │         │ Sube el PDF a R2 → devuelve el URL     │
│ Se despliega con `hs project upload`.  │ ◀─JSON── │ Guarda el URL en el deal               │
│ Código: src/app/                       │         │ Corre en Docker en un VPS. Código: src/│
└────────────────────────────────────────┘         └────────────────────────────────────────┘
```

Son **dos despliegues independientes**:
- Cambios en `src/app/**` (la card) → van a HubSpot con `hs project upload`.
- Cambios en el backend (`src/server.js`, `src/modules`, `src/plugins`, …) → `git pull` + `docker compose up -d --build` en el VPS.

**No usa base de datos.** El único estado persistente es el URL guardado en el propio deal. (Mongo
existe como plugin opcional solo para logging, hoy desactivado.)

### Stack
- **Backend:** Node 24, [Fastify 5](https://fastify.dev), [Puppeteer](https://pptr.dev) (Chromium del sistema), [@hubspot/api-client](https://www.npmjs.com/package/@hubspot/api-client), AWS S3 SDK (contra Cloudflare R2).
- **Card:** React + [@hubspot/ui-extensions](https://developers.hubspot.com/docs/platform/ui-extensions), desplegada con la HubSpot CLI (`hs`). Platform version `2026.03` (ver `hsproject.json`).
- **Infra:** Docker / docker-compose, detrás de nginx (TLS) en un VPS.

---

## El flujo de una cotización (`POST /deals/send-quote`)

Entrada: `{ "dealId": "123" }`. Salida: `{ dealId, generatedAt, pdf: { key, url } }`.

1. `getDeal` (endpoint `2026-03` vía `apiRequest`: propiedades + asociaciones con labels).
2. Resolver **quote principal** (`deal_to_primary_quote`) y **contacto** (el único si hay uno solo; si hay varios, el `principal`).
3. En paralelo: quote, contacto, empresa, line items (batch), owner, label del pipeline, timezone del portal.
4. **Recalcular y escribir `sistema` del negocio** desde los line items (checkbox múltiple unido por `;`). **Bloqueante**: si falla, no se genera el PDF.
5. `buildQuoteViewModel` (función pura) → view model limpio y ya escapado.
6. `buildProposalHtml` rellena la plantilla `src/modules/deals/designs/proposal.html`.
7. Puppeteer renderiza el PDF (limitado por un **semáforo de concurrencia**, ver abajo) y se sube a R2.
8. Guardar el URL en `url_de_la_ultima_cotizacion` (best-effort, no bloquea la respuesta).

El **número de cotización** lo administra HubSpot (`hs_quote_number`); este servicio solo lo lee.

### Concurrencia
El render de PDF abre un Chromium por request. Un **semáforo en proceso** ([`src/utils/concurrency-limit.js`](src/utils/concurrency-limit.js)) limita los renders simultáneos a `PDF_MAX_CONCURRENCY` (default **2**); los demás se **encolan** (no se rechazan). Esto evita agotar la memoria del contenedor ante una ráfaga de clics.

---

## Estructura del proyecto

```
src/
  server.js                 Arranque (escucha el puerto)
  app.js                    buildApp(): plugins, /health, error handler, rutas
  config/env.js             Lee .env / process.env (HubSpot, R2, Mongo opc., PDF_MAX_CONCURRENCY)
  plugins/
    logger.plugin.js        requestId + log de request/response (a Mongo si está activo)
    mongo.plugin.js         MongoClient (opcional; si no hay MONGO_URL, se desactiva)
    r2.plugin.js            Sube PDFs a Cloudflare R2 (S3 SDK)
  utils/
    errors.js               AppError (badRequest, serverError)
    concurrency-limit.js    Semáforo de concurrencia para el render de PDF
  modules/deals/            Núcleo del dominio (todo el flujo de la cotización)
    deal.routes.js          POST /deals/send-quote (+ validación de body)
    deal.controller.js      Solo HTTP (req → service → reply)
    deal.service.js         Orquesta: fetch → view model → PDF → R2 → writeback
    hubspot-quote.repository.js   TODA la I/O con HubSpot (único que usa el SDK)
    hubspot-associations.js Funciones puras: resolver quote/contacto principal, ids
    quote-view-model.js     Función pura: datos crudos de HubSpot → view model
    proposal-template.js    Rellena el HTML con el view model (no transforma)
    format.util.js          Funciones puras: escape, multilínea, número, moneda, fecha
    deal-sistema.js         Calcula el valor de `sistema` desde los line items
    sucursal-config.js      Fuente ÚNICA por sede: nombre, TLD del URL y % de IVA
    pdf-key.js              Construye la key (única) del PDF en R2
    designs/proposal.html   Plantilla del PDF
  app/                      Lado HubSpot (UI extension) — se despliega aparte con `hs`
    app-hsmeta.json         Definición de la app privada (scopes, permittedUrls, nombre)
    cards/send-quote-app-card.tsx   La card "Crear Cotización"
```

Los archivos `*.test.js` viven junto al código que prueban (`node:test`).

---

## Desarrollo local

### Requisitos
- Node 24+ y npm.
- Un archivo `.env` en la raíz (ver [Variables de entorno](#variables-de-entorno)). Plantilla: `.env.example`.
- Para la card: [HubSpot CLI](https://www.npmjs.com/package/@hubspot/cli) (`hs`) autenticada a una cuenta con acceso a developer projects.

### Backend
```bash
npm install
npm run dev:api        # node --watch src/server.js (recarga al guardar)
# o sin watch:
npm run start:api
```
El servidor escucha en `HOST:PORT` (default `0.0.0.0:3000`). Verifica con:
```bash
curl -s http://localhost:3000/health
```
Generar una cotización real (requiere `.env` con token y R2 válidos, y un deal con sus asociaciones):
```bash
curl -s -X POST http://localhost:3000/deals/send-quote \
  -H "Content-Type: application/json" -d '{"dealId":"<DEAL_ID_REAL>"}'
```

> Puppeteer usa el Chromium del sistema en producción (Docker). En local descarga su propio Chromium
> al instalar, salvo que definas `PUPPETEER_SKIP_DOWNLOAD`/`PUPPETEER_EXECUTABLE_PATH` (ver `Dockerfile`).

### Card (UI extension)
La card se itera/despliega con la HubSpot CLI, **no** con npm:
```bash
hs project dev        # desarrollo local con recarga en el portal
hs project upload     # subir/publicar la card a la cuenta de HubSpot
```
La card llama al backend en `API_BASE_URL` (en [`send-quote-app-card.tsx`](src/app/cards/send-quote-app-card.tsx)).
Para apuntar la card a un backend local, expón tu backend con un túnel HTTPS (p. ej. ngrok) y pon esa
URL tanto en `API_BASE_URL` como en `config.permittedUrls.fetch` de `app-hsmeta.json` (HubSpot solo
permite `hubspot.fetch` a URLs declaradas ahí).

### Tests
```bash
npm test              # node --test  (hoy: 61 tests en 11 archivos)
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
| R2 credenciales | `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` (o `CLOUDFLARE_R2_*`) | |
| Concurrencia de PDF | `PDF_MAX_CONCURRENCY` | renders simultáneos máximos (default `2`) |
| Mongo (opcional) | `MONGO_URL`, `MONGO_DB_NAME` | solo logging; sin `MONGO_URL` se desactiva |
| Servidor | `HOST`, `PORT`, `NODE_ENV` | default `0.0.0.0:3000` |

`.env` está en `.gitignore` y **nunca** se commitea; en el VPS se crea a mano.

---

## Despliegue (resumen)

Producción corre la rama `main` en un contenedor Docker (`construtecho-quotes`) detrás de nginx
(`https://smartquotes.smarteamcr.com` → `127.0.0.1:3003`). Para actualizar:
```bash
git pull && docker compose up -d --build
```
La guía completa (VPS, nginx, TLS, scopes, card) está en **[docs/DEPLOY.md](docs/DEPLOY.md)**.

---

## Más documentación
- **[docs/ESTADO-Y-PENDIENTES.md](docs/ESTADO-Y-PENDIENTES.md)** — handoff completo: arquitectura, decisiones y por qué, mapeo de campos PDF↔HubSpot, scopes, backlog y gotchas.
- **[docs/DEPLOY.md](docs/DEPLOY.md)** — guía de despliegue paso a paso.
- **`docs/superpowers/specs/` y `plans/`** — specs y planes históricos por cambio (contexto de diseño).
- **`CLAUDE.md`** — reglas para trabajar con los componentes de HubSpot del proyecto.
