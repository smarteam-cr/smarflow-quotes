# Smartquotes — Estado del proyecto, contexto y pendientes

> **Documento de handoff.** Si retomas el proyecto en una sesión nueva, lee esto
> primero: resume QUÉ es, QUÉ se hizo, POR QUÉ, cómo está en producción y QUÉ falta.
> Última actualización: 2026-06-03.

---

## 1. Qué es

**Smartquotes** genera **cotizaciones en PDF** a partir de un **Deal (negocio) de
HubSpot**. El usuario abre un deal, presiona **"Crear Cotización"** (card en el
panel lateral), y el sistema arma un PDF con los datos del deal y sus asociaciones,
lo sube a **Cloudflare R2** y devuelve el URL público. El URL también se guarda en
el deal (propiedad `url_de_la_ultima_cotizacion`).

Pensado para poder volverse **multi-tenant (SaaS)** en el futuro, por eso el
branding interno es genérico ("Smartquotes"), no atado a un cliente.

**Estado: EN PRODUCCIÓN y funcionando** para el cliente Construtecho.

---

## 2. Arquitectura (2 piezas)

```
┌─ Card de HubSpot (UI extension) ──────┐      ┌─ Backend Fastify + Puppeteer ────────┐
│ "Crear Cotización" (panel lateral)    │      │ Consulta HubSpot (API)               │
│ Vive en el portal de HubSpot          │ ───▶ │ Arma HTML → PDF (Chromium headless)  │
│ Llama por HTTPS con hubspot.fetch()   │ HTTPS│ Sube PDF a R2 → devuelve URL         │
│ Se despliega con `hs project upload`  │      │ Corre en Docker en el VPS            │
└───────────────────────────────────────┘      └──────────────────────────────────────┘
```

**Flujo interno (`POST /deals/send-quote`):**
1. `getDeal` (endpoint `2026-03` vía `apiRequest`, trae propiedades + asociaciones con labels).
2. Resolver quote principal (`deal_to_primary_quote`) y contacto principal (`principal`).
3. En paralelo: quote, contacto, empresa, line items, owner, pipeline label, timezone del portal.
4. `buildQuoteViewModel` (función pura) → view model limpio y formateado.
5. `buildProposalHtml` rellena `designs/proposal.html`.
6. Puppeteer (`networkidle0`) → PDF → R2 (`uploadPdf`).
7. Guardar URL en `url_de_la_ultima_cotizacion` (best-effort, no bloquea).

**No usa base de datos.** (Mongo es opcional, solo para logging, y está desactivado.)

---

## 3. Producción (cómo está montado)

| Aspecto | Valor |
|---------|-------|
| Backend (URL pública) | `https://smartquotes.smarteamcr.com` (nginx → TLS → `127.0.0.1:3003`) |
| Servidor | VPS Hostinger, Debian 13, Docker. Ruta: `/opt/smartflow/Construtecho_Quotes` |
| Contenedor | `construtecho-quotes` (compose), puerto **`127.0.0.1:3003`** (solo localhost) |
| Reverse proxy | nginx (`conf.d`), server block propio; resto de proyectos del server intactos |
| Almacenamiento | Cloudflare R2, bucket `hs-quotes-construtecho` (del cliente, lo administramos nosotros) |
| Rama desplegada | `main` |
| Card URL (`API_BASE_URL`) | `https://smartquotes.smarteamcr.com` (en `send-quote-app-card.tsx` y `permittedUrls.fetch`) |
| Healthcheck | `GET /health` → status, service, version, timestamp, uptime, checks (hubspot/r2) |

**Operación:** `docker compose logs -f`, `docker compose restart`, actualizar con
`git pull && docker compose up -d --build`. Detalle en `docs/DEPLOY.md`.

---

## 4. Mapa del código (backend)

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/server.js` / `src/app.js` | Arranque Fastify, plugins, `/health`, rutas |
| `src/config/env.js` | Lee `.env` / `process.env` (HubSpot token, R2, Mongo opc.) |
| `src/modules/deals/deal.routes.js` / `deal.controller.js` | Endpoint `POST /deals/send-quote` |
| `src/modules/deals/deal.service.js` | Orquesta: fetch → view model → PDF → R2 → writeback |
| `src/modules/deals/hubspot-quote.repository.js` | **Toda** la I/O con HubSpot (único que usa el SDK) |
| `src/modules/deals/hubspot-associations.js` | Funciones puras: resolver quote/contacto principal, ids |
| `src/modules/deals/quote-view-model.js` | Función **pura**: datos crudos HubSpot → view model |
| `src/modules/deals/proposal-template.js` | Rellena el HTML con el view model (no transforma) |
| `src/modules/deals/format.util.js` | Funciones puras: escape, multilínea, número, moneda, fecha |
| `src/modules/deals/designs/proposal.html` | Plantilla del PDF (header, info, productos, **última hoja T&C estática**) |
| `src/plugins/{r2,mongo,logger}.plugin.js` | R2 (subir PDF), Mongo (opc.), logging |

**Frontend (card):** `src/app/cards/send-quote-app-card.tsx` + `send-quote-hsmeta.json`.
**App HubSpot:** `src/app/app-hsmeta.json` (scopes, `permittedUrls`, nombre "Smartquotes").

**Tests:** `*.test.js` con `node:test` (`npm test`). **27 tests** sobre las
funciones puras (format.util, hubspot-associations, quote-view-model, proposal-template).
El repository y el service se validan con integración manual.

---

## 5. Mapeo de campos (PDF ← HubSpot)

| Campo PDF | Origen | Propiedad |
|-----------|--------|-----------|
| Empresa / Dirección | Company | `name`, `address` |
| # Proyecto, Obra, Lugar entrega, Tasa cambio, Garantía, # Registro, Condición de pago, Tiempos | Deal | `codigo_de_proyecto`, `obra`, `lugar_de_entrega`, `tasa_de_cambio`, `garantia`, `numero_de_registro`, `condicion_de_pago`, `tiempo_de_entrega_de_materiales`, `tiempo_de_ejecucion` |
| Contacto / Teléfonos | Contacto **principal** | `firstname`+`lastname`, `phone` |
| Asesor | Owner (de `hubspot_owner_id`) | "Nombre Apellido (email)" |
| Moneda | Deal | `deal_currency_code` (**código ISO tal cual**, ej. GTQ) |
| Sucursal | Pipeline (label) | última palabra del label de `pipeline` |
| Fecha / Vigencia | Quote **principal** | `hs_last_published_date` / `hs_expiration_date` (en TZ del portal) |
| Cantidad/Nombre/Datos técnicos/Descripción/Precio | Line item | `quantity`, `name`, `datos_tecnicos`, `description`, `price` |
| Categoría (agrupador) | Line item | `despiece` (valor interno, ya es texto legible) |
| Total línea | Line item | `amount` |
| Subtotal / IVA / Total general | Quote **principal** | `hs_tcv` / `hs_tax_total` / `hs_quote_amount` |

---

## 6. Decisiones y el porqué

- **Sin base de datos.** El flujo no necesita persistencia propia; el URL se guarda
  en el deal. Mongo queda opcional para logging futuro.
- **Moneda = código ISO tal cual** (GTQ, USD). El cliente pidió mostrar lo que trae
  HubSpot, no convertir a símbolo. (Antes se convertía a "Q"/"$"; se quitó.)
- **Quote/contacto principal por label de asociación** (`deal_to_primary_quote` /
  `principal`). Se usa el endpoint dado `2026-03` vía `apiRequest` porque es el
  verificado que devuelve esos labels.
- **Sin contacto principal → vacío** (sin fallback a otro contacto). Decisión del negocio.
- **Sin quote principal → totales vacíos** (sin recálculo). Las cotizaciones son de pago único, así que `hs_tcv` = subtotal es válido.
- **Item sin despiece → "Sin categoría"** al final.
- **Última hoja (T&C) estática**, fluye después de los productos (no fuerza página nueva). Contenido fijo; CONSTRULOGIX, S.A. es intencional (razón social).
- **Fechas en zona horaria del portal** (Account Info API, cacheada), formato "martes, enero 27, 2026".
- **Puerto `127.0.0.1:3003`**: solo localhost (nginx delante) por seguridad; evita exponer el puerto directo a internet y el bypass de firewall que hace Docker con `0.0.0.0`.
- **Docker con Chromium del sistema (apt) + fuentes** (`fonts-liberation`, `fonts-noto-core`): apt resuelve las libs (incl. t64 de Debian 13) y las fuentes garantizan que el PDF se vea idéntico. `shm_size: 1gb` e `init: true` para que Chromium no crashee ni deje zombies.
- **Escape de seguridad:** el view model entrega strings ya escapados; el template solo inserta. Multilínea (`\n`→`<br>`) en `condicion_de_pago`, `datos_tecnicos`, `description`.
- **Card "Crear Cotización"** (antes "Enviar"): no se envía nada, se crea/genera.

---

## 7. Scopes de HubSpot requeridos (private app del cliente)

`crm.objects.contacts.read`, `crm.objects.deals.read/write`, `crm.objects.companies.read`,
`crm.objects.line_items.read`, `crm.objects.quotes.read`, `crm.objects.owners.read`,
`account-info.security.read`. (Si el PDF sale completo, los scopes están bien;
`deals.write` es para guardar el URL en el deal.)

---

## 8. Pendientes / Backlog (por hacer)

### En progreso — ajustes al PDF (spec aprobado 2026-06-04)
Spec: `docs/superpowers/specs/2026-06-04-ajustes-pdf-tld-vigencia-contacto-design.md`.
Tres cambios acotados a view model / plantilla / asociaciones, **sin llamadas nuevas a
HubSpot** (solo backend; no requiere `hs project upload`):
- **TLD por sucursal:** el URL del PDF cambia su TLD (`.gt`, `.hn`, …) según la sucursal,
  vía un mapa único en `quote-view-model.js` (`SUCURSAL_TLD`); default `gt`.
- **Vigencia literal:** `vigencia` deja de salir de `hs_expiration_date`; ahora es la
  propiedad de deal `vigencia_en_dias` (número validado por regex en HubSpot) + " días"
  (p. ej. `15 días`); vacío → vacío. Se deja de pedir `hs_expiration_date`.
- **Contacto por defecto:** si el deal tiene un solo contacto se usa aunque no tenga
  etiqueta `principal`; con varios se desambigua por `principal` (ninguno o más de uno
  con `principal` → vacío). Conteo por id único.
- **Prerrequisito HubSpot:** crear la propiedad de deal `vigencia_en_dias`.
- `numero_de_registro` (Cambio 3 evaluado) **no se toca**: sigue manual en el deal.

### Pulido inmediato (ya en código, falta desplegar el card)
- [ ] `git push origin main` + `hs project upload` para aplicar: limpieza de URLs de
  túnel del `permittedUrls`, slash final de la URL, y el nuevo nombre "Smartquotes".
  (Ya commiteado en `main`; el backend del VPS no necesita rebuild por esto.)

### B1 — Persistir el estado del card al recargar *(frontend, sin backend)*
Al montar el card, leer `url_de_la_ultima_cotizacion` con el hook `useCrmProperties`
(`@hubspot/ui-extensions`) y, si existe, mostrar el link "Abrir cotización (PDF)".
El dato ya se guarda en el deal; solo falta leerlo al cargar. Esfuerzo: bajo.

### B2 — Botón "Crear nueva cotización" según estado *(va con B1)*
- Sin cotización → botón "Crear cotización".
- Con cotización → mostrar el link existente + botón "Crear nueva cotización" (regenera).
- Re-crear genera un PDF nuevo con datos actuales y actualiza el link (llamar `refetch`).

### B3 — (Opcional) Persistir la fecha de generación
Para mostrar "Generada el…" también al recargar: crear propiedad de deal
`fecha_ultima_cotizacion` y que el backend la escriba junto con el URL. Esfuerzo: bajo.

### B4 — (Futuro) Privacidad de PDFs
Hoy los PDFs son públicos por URL `*.r2.dev` (key no adivinable). Si se requiere:
dominio propio para R2 y/o URLs firmadas con expiración.

### B5 — (Futuro) Auditoría/historial
Activar logging en Mongo (ya soportado, hoy desactivado) si quieren historial.

### B6 — (Futuro, SaaS) Multi-tenant
Hoy hay un solo token/bucket por `.env`. Para multi-tenant habría que resolver
credenciales por cuenta (token de HubSpot y/o R2 por tenant).

---

## 9. Gotchas / notas para retomar

- **El card y el backend son despliegues separados.** Cambios en `src/app/**` → `hs
  project upload` (van a HubSpot). Cambios en el backend → `git pull` + `docker
  compose up -d --build` en el VPS.
- **`src/app/dist/` es artefacto generado** (gitignored); no se edita a mano.
- **No cambiar el `uid`** de `app-hsmeta.json` ni de la card (rompe la identidad en HubSpot).
- **`.env` está en `.gitignore`**; en el VPS se crea a mano. Nunca se commitea.
- **El token del `.env` de producción debe ser el de la private app del CLIENTE.**
- Documentos: diseño en `docs/superpowers/specs/2026-06-01-...`, plan en
  `docs/superpowers/plans/2026-06-01-...`, despliegue en `docs/DEPLOY.md`.
