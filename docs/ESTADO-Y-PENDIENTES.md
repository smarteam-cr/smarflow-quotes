# Estado del proyecto y pendientes — Cotizaciones Construtecho

Documento vivo. Resume qué está hecho, las decisiones tomadas, el estado del
despliegue y lo que queda por hacer (backlog). Última actualización: 2026-06-02.

> Documentos relacionados:
> - Diseño: `docs/superpowers/specs/2026-06-01-dynamic-quote-pdf-design.md`
> - Plan de implementación: `docs/superpowers/plans/2026-06-01-dynamic-quote-pdf.md`
> - Despliegue: `docs/DEPLOY.md`

---

## 1. Qué hace el sistema

Desde un Deal en HubSpot, el usuario presiona **"Crear Cotización"** (card en el
panel lateral). El backend consulta los datos del deal y asociaciones, genera un
**PDF** de la cotización, lo sube a **Cloudflare R2** y devuelve el URL. El URL
también se guarda en la propiedad del deal `url_de_la_ultima_cotizacion`.

Arquitectura: **Card de HubSpot** (UI extension) → `hubspot.fetch()` → **backend
Fastify + Puppeteer** (en el VPS) → R2.

---

## 2. Implementado (✅)

**Generación dinámica del PDF**
- Consulta del Deal (endpoint dado `2026-03` vía `apiRequest`) + asociaciones.
- **Quote principal** por asociación `deal_to_primary_quote`.
- **Contacto principal** por asociación `principal` (sin fallback si no existe).
- **Owner** → "Nombre Apellido (email)" en el campo Asesor.
- **Pipeline** → label → última palabra = Sucursal.
- **Zona horaria** del portal (Account Info API, cacheada) para las fechas.
- Agrupación de line items por **`despiece`**; items sin despiece → "Sin categoría" al final.
- Tabla de **6 columnas** (incluye "Datos técnicos").
- Totales desde la quote (`hs_tcv`, `hs_tax_total`, `hs_quote_amount`); vacíos si no hay quote.
- Formateo: fechas en TZ del portal (orden "martes, enero 27, 2026"), multilínea
  (`\n` → `<br>`), escape HTML, y **moneda = código ISO tal cual** (GTQ, USD…).
- Guardado del URL del PDF en `url_de_la_ultima_cotizacion` (best-effort).

**PDF / diseño**
- Header con logo + certificaciones; **Sucursal dinámica** también en el header ("Sucursal {branch}").
- Última hoja **estática** de términos y condiciones (formas de pago, firmas,
  cláusulas I–VI, footer), fluye después de los productos.
- Firma del medio = **nombre del asesor dinámico** (sin email); espacio de firma ampliado.
- Paginación: encabezado de columnas se repite por página, filas/categorías no se
  cortan, totales juntos.

**Card de HubSpot**
- Renombrada a **"Crear Cotización"** (botón "Crear cotización").
- Muestra el link al PDF y la fecha tras generar; alertas de éxito/error.

**Calidad / infra**
- **27 tests unitarios** (`node:test`) verdes sobre las funciones puras.
- **Docker** listo: `Dockerfile` (Chromium del sistema + fuentes), `docker-compose.yml`
  (puerto `127.0.0.1:3003`, `shm_size 1gb`, `init`), `.dockerignore`.
- Guía de despliegue en `docs/DEPLOY.md`.

---

## 3. Decisiones tomadas

- **Sin base de datos.** Mongo es opcional (solo logging) y está desactivado.
- **Moneda:** se muestra el **código ISO** de HubSpot tal cual (no símbolo).
- **Sin contacto principal** → campos de contacto vacíos (sin fallback a otro contacto).
- **Sin quote principal** → subtotal/IVA/total vacíos (sin cálculo de respaldo).
- **Item sin despiece** → grupo "Sin categoría" al final.
- **Última hoja** → estática; fluye después de los productos (no fuerza página nueva).
- **CONSTRULOGIX, S.A.** en la última hoja es intencional (razón social).
- **IVA "12%"** es etiqueta fija; el monto viene de `hs_tax_total`.
- **Puerto del backend:** `127.0.0.1:3003` (solo localhost; nginx hace de proxy).
- **PDFs públicos** vía URL `*.r2.dev` (key no adivinable). Aceptado por ahora.

---

## 4. Estado del despliegue (🚧 en curso)

Hecho: archivos de despliegue creados y commiteados; servidor auditado (puerto
3003 libre, 13 GB RAM disponibles, Debian 13, nginx por `conf.d`).

Pendiente (ver `docs/DEPLOY.md` para comandos):
- [ ] Merge de la rama de trabajo a `main` y push.
- [ ] `git clone` en `/opt/smartflow/Construtecho_Quotes` (rama `main`).
- [ ] Crear `.env` de producción en el VPS (token del **cliente** + R2 del cliente).
- [ ] `docker compose build && up -d` y probar `curl http://127.0.0.1:3003/health`.
- [ ] **Subdominio** (pedir a quien maneja DNS) + nginx + TLS (Let's Encrypt). *(Fase 3)*
- [ ] Crear/obtener token de la private app del **cliente** con sus scopes.
- [ ] Cambiar `API_BASE_URL` del card (ngrok → subdominio) en `send-quote-app-card.tsx`
      y `permittedUrls.fetch` en `app-hsmeta.json`.
- [ ] `hs project upload` a la cuenta del cliente.
- [ ] Verificación end-to-end desde un deal real.

---

## 5. Pendientes / Backlog (📋 por hacer)

### B1 — Persistir el estado del card al recargar *(frontend, sin backend)*
Al montar el card, leer `url_de_la_ultima_cotizacion` con el hook `useCrmProperties`
y, si existe, mostrar el link "Abrir cotización (PDF)". El dato ya se guarda en el
deal; solo falta leerlo al cargar. Esfuerzo: bajo.

### B2 — Botón "Crear nueva cotización" según estado *(frontend, va con B1)*
- Sin cotización → botón "Crear cotización".
- Con cotización existente → mostrar el link + botón "Crear nueva cotización" (regenera).
- Re-crear genera un PDF nuevo con los datos actuales y actualiza el link.

### B3 — (Opcional) Persistir la fecha de generación
Para mostrar "Generada el…" también al recargar: crear una propiedad de deal
(ej. `fecha_ultima_cotizacion`) y que el backend la escriba junto con el URL.
Esfuerzo: bajo (1 propiedad + 1 línea en el backend).

### B4 — (Futuro, opcional) Privacidad de los PDFs
Hoy los PDFs son públicos por la URL `*.r2.dev`. Si se requiere más control:
dominio propio para R2 y/o URLs firmadas con expiración.

### B5 — (Futuro, opcional) Auditoría/historial
Si el cliente quiere historial de cotizaciones generadas, activar el logging en
Mongo (ya soportado, hoy desactivado) o registrar en otra tabla.
