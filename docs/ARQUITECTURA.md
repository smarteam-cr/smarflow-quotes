# Arquitectura — Smartquotes

Referencia técnica del proyecto: cómo está armado, cómo fluye una cotización, qué hace cada parte
del código y de qué servicios externos depende. Para instalar y correr, ver el [README](../README.md).
Para entrega, despliegue y pendientes, ver [ENTREGA.md](ENTREGA.md).

---

## 1. Las dos piezas

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

**No usa base de datos.** El único estado persistente es el URL guardado en el propio deal.
(Mongo existe como plugin opcional solo para logging, hoy desactivado.)

---

## 2. Flujo de una cotización (`POST /deals/send-quote`)

Entrada: `{ "dealId": "123" }`. Salida: `{ dealId, generatedAt, pdf: { key, url } }`.

1. `getDeal` (endpoint `2026-03` vía `apiRequest`: propiedades + asociaciones con labels).
2. Resolver **quote principal** (`deal_to_primary_quote`) y **contacto** (el único si hay uno solo; si hay varios, el `principal`).
3. En paralelo: quote, contacto, empresa, line items (batch), owner, label del pipeline, timezone del portal.
4. **Recalcular y escribir `sistema` del negocio** desde los line items (checkbox múltiple unido por `;`). **Bloqueante**: si falla, no se genera el PDF.
5. `buildQuoteViewModel` (función pura) → view model limpio y ya escapado.
6. `buildProposalHtml` rellena la plantilla `src/modules/deals/designs/proposal.html`.
7. Puppeteer renderiza el PDF (limitado por un **semáforo de concurrencia**, ver §6) y se sube a R2.
8. Guardar el URL en `url_de_la_ultima_cotizacion` (best-effort, no bloquea la respuesta).

El **número de cotización** lo administra HubSpot (`hs_quote_number`); este servicio solo lo lee.

---

## 3. Estructura de carpetas

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

docs/                       Esta documentación (+ superpowers/ = historial de diseño)
Dockerfile, docker-compose.yml   Imagen y servicio del backend
```

Los archivos `*.test.js` viven junto al código que prueban (`node:test`, `npm test`).

---

## 4. Componentes principales (mapa del código)

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/server.js` / `src/app.js` | Arranque Fastify, plugins, `/health`, rutas |
| `src/config/env.js` | Lee `.env` / `process.env` (HubSpot token, R2, Mongo opc.) |
| `src/modules/deals/deal.routes.js` · `deal.controller.js` | Endpoint `POST /deals/send-quote` (validación + HTTP) |
| `src/modules/deals/deal.service.js` | Orquesta: fetch → view model → PDF → R2 → writeback |
| `src/modules/deals/hubspot-quote.repository.js` | **Toda** la I/O con HubSpot (único que usa el SDK) |
| `src/modules/deals/hubspot-associations.js` | Funciones puras: resolver quote/contacto principal, ids |
| `src/modules/deals/quote-view-model.js` | Función **pura**: datos crudos HubSpot → view model |
| `src/modules/deals/proposal-template.js` | Rellena el HTML con el view model (no transforma) |
| `src/modules/deals/format.util.js` | Funciones puras: escape, multilínea, número, moneda, fecha |
| `src/modules/deals/sucursal-config.js` | **Fuente única** por sede: nombre, TLD del URL y % de IVA (etiqueta) |
| `src/modules/deals/pdf-key.js` | Key única del PDF en R2 (dealId + timestamp + entropía) |
| `src/modules/deals/designs/proposal.html` | Plantilla del PDF (header, info, productos, última hoja T&C estática) |
| `src/utils/concurrency-limit.js` | Semáforo de concurrencia para el render de PDF |
| `src/plugins/{r2,mongo,logger}.plugin.js` | R2 (subir PDF), Mongo (opc.), logging |
| `src/app/cards/send-quote-app-card.tsx` | La card "Crear Cotización" (frontend) |
| `src/app/app-hsmeta.json` | App privada de HubSpot: scopes, `permittedUrls`, nombre |

El diseño separa **funciones puras** (view model, formato, asociaciones, plantilla) de la **I/O**
(repository, plugins). Solo el repository toca HubSpot y solo el plugin R2 toca Cloudflare; eso hace
el núcleo fácil de testear sin red.

---

## 5. Servicios externos

| Servicio | Para qué | Cómo se conecta |
|----------|----------|-----------------|
| **HubSpot** (API CRM) | Origen de todos los datos (deal, quote, contacto, empresa, line items, owner, pipeline, timezone) y destino del URL final | Private app del cliente; token en `.env`. Toda la I/O en `hubspot-quote.repository.js` |
| **Cloudflare R2** | Almacena el PDF generado y lo sirve por URL público | S3 SDK (`r2.plugin.js`); bucket y credenciales en `.env` |
| **HubSpot CLI (`hs`)** | Desplegar e iterar la card (UI extension) | `hs project upload` / `hs project dev` |

No hay WordPress, ni base de datos, ni otros servicios. (Mongo es un plugin opcional para logging,
desactivado en producción.)

---

## 6. Concurrencia del render de PDF

El render abre un Chromium por request. Un **semáforo en proceso**
([`src/utils/concurrency-limit.js`](../src/utils/concurrency-limit.js)) limita los renders
simultáneos a `PDF_MAX_CONCURRENCY` (default **2**); los demás se **encolan** (no se rechazan).
Esto evita agotar la memoria del contenedor ante una ráfaga de clics. La key del PDF en R2 lleva
entropía ([`pdf-key.js`](../src/modules/deals/pdf-key.js)) para que dos generaciones del mismo deal
no colisionen.

Se resolvió con un semáforo en memoria (no Redis, colas externas ni réplicas) porque con un solo
proceso/contenedor resuelve el problema para el volumen actual sin sobreingeniería.

---

## 7. Mapeo de campos (PDF ← HubSpot)

| Campo PDF | Origen | Propiedad |
|-----------|--------|-----------|
| Empresa / Dirección | Company | `name`, `address` |
| # Proyecto | Quote **principal** | `hs_quote_number` (autogenerado por HubSpot al crear la cotización) |
| Obra, Lugar entrega, Tasa cambio, Garantía, # Registro, Condición de pago, Tiempos | Deal | `obra`, `lugar_de_entrega`, `tasa_de_cambio`, `garantia`, `numero_de_registro`, `condicion_de_pago`, `tiempo_de_entrega_de_materiales`, `tiempo_de_ejecucion` |
| Contacto / Teléfonos | Contacto **principal** (o el único si hay uno solo) | `firstname`+`lastname`, `phone` |
| Asesor | Owner (de `hubspot_owner_id`) | "Nombre Apellido (email)" |
| Moneda | Deal | `deal_currency_code` (**código ISO tal cual**, ej. GTQ) |
| Sucursal (nombre) | Pipeline (label) | `sucursal-config.js` (match porque el label *termina con* el país) |
| Fecha | Quote **principal** | `hs_last_published_date` (en TZ del portal) |
| Vigencia | Deal | `vigencia_en_dias` (número) mostrado literal + " días" (ej. `15 días`) |
| Cantidad/Nombre/Datos técnicos/Descripción/Precio | Line item | `quantity`, `name`, `datos_tecnicos`, `description`, `price` |
| Categoría (agrupador) | Line item | `despiece` (valor interno, ya legible) |
| Total línea | Line item | `amount` |
| Subtotal / IVA / Total general | Quote **principal** | `hs_tcv` / `hs_tax_total` / `hs_quote_amount` |
| TLD del URL del PDF | Sucursal | `sucursal-config.js` (Guatemala `gt`, Honduras `hn`; default `gt`) |
| Etiqueta IVA `N%` | Sucursal | `sucursal-config.js` (Guatemala `12`, Honduras `15`). El **monto** del IVA sigue de `hs_tax_total` |

---

## 8. Decisiones clave (el porqué)

- **Sin base de datos.** El flujo no necesita persistencia propia; el URL se guarda en el deal. Mongo queda opcional para logging futuro.
- **Moneda = código ISO tal cual** (GTQ, USD). El cliente pidió mostrar lo que trae HubSpot, no convertir a símbolo.
- **Quote/contacto principal por label de asociación** (`deal_to_primary_quote` / `principal`), vía el endpoint `2026-03` con `apiRequest` (es el verificado que devuelve esos labels).
- **Contacto: el principal, o el único si hay uno solo.** Con un solo contacto se usa aunque no tenga etiqueta; con varios se desambigua por `principal` (si ninguno o más de uno la tiene → vacío).
- **Última hoja (T&C) estática**, fluye después de los productos. Contenido fijo; "CONSTRULOGIX, S.A." es intencional (razón social).
- **Fechas en zona horaria del portal** (Account Info API, cacheada).
- **Puerto `127.0.0.1:3003`** (solo localhost, nginx delante) para no exponer el puerto directo a internet.
- **Docker con Chromium del sistema (apt) + fuentes** (`fonts-liberation`, `fonts-noto-core`) para que el PDF se vea idéntico. `shm_size: 1gb` e `init: true` para que Chromium no crashee ni deje zombies.
- **Escape de seguridad:** el view model entrega strings ya escapados; el template solo inserta. Multilínea (`\n`→`<br>`) en `condicion_de_pago`, `datos_tecnicos`, `description`.
- **`sistema` del negocio se sincroniza desde los line items, bloqueante.** Al crear la cotización se recalcula y **reemplaza** `sistema` del deal con los valores de los line items (ambas son checkbox múltiple). Se escribe **antes** del PDF; si falla, no hay PDF. *Por qué:* alimenta métricas del negocio y un fallo silencioso las descuadraría. Precondición: las opciones de `sistema` del negocio deben incluir las de productos.
- **Config por sucursal en un solo archivo (`sucursal-config.js`).** Todo lo que depende de la sede (nombre mostrado, TLD del URL, % de IVA) vive en `SUCURSALES`. Agregar una sede o cambiar un dato = editar **solo** ese archivo. El match es por *fin del label* del pipeline (una sede de dos palabras como "Costa Rica" no se trunca). `ivaPct` es solo la **etiqueta** del % en el PDF; el **monto** del IVA lo calcula HubSpot (`hs_tax_total`) — mantenerlos coherentes por sede.

---

## 9. Scopes de HubSpot (private app del cliente)

`crm.objects.contacts.read`, `crm.objects.deals.read/write`, `crm.objects.companies.read`,
`crm.objects.line_items.read`, `crm.objects.quotes.read`, `crm.objects.owners.read`,
`account-info.security.read`.

Si el PDF sale completo, los scopes están bien. `deals.write` es para escribir el `sistema` y guardar
el URL en el deal. La lista completa configurada está en `src/app/app-hsmeta.json`.
