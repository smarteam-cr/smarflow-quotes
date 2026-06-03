# Diseño: Generación dinámica de cotización PDF (Construtecho)

**Fecha:** 2026-06-01
**Estado:** Aprobado para planificación
**Fase:** 2 (datos dinámicos). La Fase 1 (mockup HTML hardcodeado) ya está hecha.

---

## 1. Contexto y objetivo

`smarflow-quotes` (Smartquotes) es una app privada de HubSpot para Construtecho
Centroamérica. Genera un PDF de cotización a partir de los datos de un Deal del
CRM. La Fase 1 reprodujo el diseño visual objetivo (`proposal.html`) con datos
de ejemplo hardcodeados. Esta fase reemplaza esos datos por información real
consultada a HubSpot, agrupa los productos por categoría (`despiece`) de forma
dinámica, pagina la cotización de forma estéticamente correcta, y guarda el URL
del PDF generado de vuelta en el Deal.

**Resultado esperado:** al llamar `POST /deals/send-quote` con un `dealId` real,
el backend produce un PDF fiel al diseño, con datos reales, paginado limpio, lo
sube a R2, devuelve el URL y lo escribe en el Deal.

---

## 2. Alcance

### Dentro de esta fase
- Consultar Deal + asociaciones (empresa, contacto principal, line items, quote
  principal), owner, pipeline y zona horaria de la cuenta.
- Construir un *view model* limpio a partir de las respuestas crudas de HubSpot.
- Renderizar el template con datos reales.
- Agrupar line items por `despiece` (selección única).
- Tabla de 6 columnas (se añade "Datos técnicos").
- Formateo: fechas en zona horaria del portal, moneda según `deal_currency_code`,
  texto multilínea (`\n`).
- Paginación robusta de la sección de productos.
- Guardar el URL del PDF en la propiedad `url_de_la_ultima_cotizacion` del Deal.
- Manejo de casos vacíos.

### Fuera de esta fase (futuro)
- **Última hoja** de términos y condiciones (estática). Se deja un *hook* en el
  template para engancharla después; el contenido se solicitará cuando se aborde.
- Conexión/ajuste del botón de la card de HubSpot y su URL de túnel.
- Refactors no relacionados con esta funcionalidad.

---

## 3. Arquitectura y flujo de datos

```
POST /deals/send-quote { dealId }
        │
        ▼
deal.controller.sendQuote
        │
        ▼
deal.service.sendQuote(dealId)
        │
        ├─ 1. repository.getDeal(dealId)          → deal + associations
        │       (companies, contacts, line_items, quotes)
        ├─ 2. resolver: quote principal            → type "deal_to_primary_quote"
        │       repository.getQuote(quoteId)        → hs_tcv, hs_tax_total,
        │                                             hs_quote_amount, fechas
        ├─ 3. resolver: contacto principal          → type "principal"
        │       repository.getContact(contactId)    → firstname, lastname, email, phone
        ├─ 4. repository.getCompany(companyId)      → name, address
        ├─ 5. repository.getLineItems(ids)          → quantity, name, datos_tecnicos,
        │                                             description, price, amount, despiece
        ├─ 6. repository.getOwner(ownerId)          → firstName, lastName, email
        ├─ 7. repository.getPipelineLabel(pipeId)   → label → última palabra
        ├─ 8. repository.getPortalTimeZone()        → timeZone (cacheado)
        │
        ▼
quote-view-model.build(raw)  → view model limpio y formateado
        │
        ▼
proposal-template.render(viewModel) → HTML
        │
        ▼
Puppeteer (networkidle0) → PDF buffer
        │
        ├─ storage.uploadPdf(...)                   → { key, url }
        └─ repository.saveQuoteUrl(dealId, url)     → update url_de_la_ultima_cotizacion
        │
        ▼
respuesta { dealId, pdf: { key, url }, ... }
```

**Manejo de errores del flujo:**
- Si **falla la subida a R2** → propagar error, responder HTTP 500, **no** se
  guarda el URL en el Deal.
- Si **falla el guardado del URL** en el Deal (paso writeback) → registrar
  *warning* y **no** bloquear la respuesta: el PDF ya está en R2 y su URL ya se
  devuelve al cliente. El writeback es best-effort.
- Las consultas de owner, pipeline y timezone que fallen no deben abortar el PDF:
  degradan a vacío / valor por defecto (ver §11).

---

## 4. Estructura de código

Hoy la lógica está concentrada en `deal.service.js` y `proposal-template.js`. Se
separa en unidades con un único propósito, para aislar la complejidad de HubSpot
y poder testear cada parte:

| Archivo | Responsabilidad | Estado |
|---------|-----------------|--------|
| `deal.service.js` | Orquesta: pide datos, arma view model, dispara PDF, sube a R2, guarda URL | Refactor |
| `hubspot-quote.repository.js` | **Todas** las lecturas/escrituras a HubSpot. Devuelve datos crudos. Único módulo que conoce el SDK | Nuevo |
| `quote-view-model.js` | Función **pura** (sin I/O) con manejo **defensivo** de datos incompletos. Devuelve un view model seguro para renderizar (ningún campo `undefined`) | Nuevo |
| `proposal-template.js` | Solo renderiza: recibe view model, llena el HTML. No conoce HubSpot | Refactor |
| `format.util.js` | `formatDate(value, tz)`, `formatMoney(value, currency)`, `escapeHtml`, `multilineToHtml` | Nuevo |
| `designs/proposal.html` | Template (añadir columna "Datos técnicos"; hook de última hoja) | Refactor |

**Principio:** el `repository` concentra los *lookups* y rarezas de la API; el
`view-model` es una función pura (toma datos crudos, no hace I/O) que ya resuelve
defensivamente todos los casos vacíos; el `template` solo pinta strings ya listos.

---

## 5. Referencia de consultas a HubSpot

SDK: `@hubspot/api-client@13.5.0` (Node ESM). Reusar la instancia `Client`
existente (`new Client({ accessToken, numberOfApiCallRetries: 3 })`).

> **Rate limits / reintentos:** `numberOfApiCallRetries: 3` ya aplica backoff
> automático ante 429. Los *batch read* tienen límite de ~100 ids por request;
> si un deal tuviera más line items, el repository debe partir en lotes (chunk).

### 5.1 Deal + asociaciones

```js
const DEAL_PROPERTIES = [
  'codigo_de_proyecto',
  'tiempo_de_entrega_de_materiales',
  'tiempo_de_ejecucion',
  'obra',
  'lugar_de_entrega',
  'deal_currency_code',
  'tasa_de_cambio',
  'garantia',
  'numero_de_registro',
  'condicion_de_pago',
  'hubspot_owner_id',
  'pipeline',
];

const deal = await hubspotClient.crm.deals.basicApi.getById(
  dealId,
  DEAL_PROPERTIES,
  undefined,                                       // propertiesWithHistory
  ['companies', 'contacts', 'line_items', 'quotes'], // associations
);
```

**Resolución de asociaciones** (cada item es `{ id, type }`):
- **Quote principal** = `quotes.results.find(r => r.type === 'deal_to_primary_quote')`.
  Si hay más de uno con ese type, tomar el primero y deduplicar por id. Si **no
  hay** ninguno → no se consulta quote; totales vacíos (§11).
- **Contacto principal** = `contacts.results.find(r => r.type === 'principal')`.
  El mismo id puede venir también como `deal_to_contact`; basta con encontrar el
  de type `principal`. Si hay varios `principal`, tomar el primero. Si **no hay**
  ninguno `principal` → contacto vacío (§11). **No** se usa `deal_to_contact` como
  fallback (decisión del negocio).
- **Empresa** = primer id de `companies.results`.
- **Line items** = todos los ids de `line_items.results`.

**A verificar en implementación (con fallback definido):** confirmar que
`basicApi.getById` (ruta `/crm/v3/`) expone los labels `principal` /
`deal_to_primary_quote`. El portal los devuelve vía el endpoint dado
`/crm/objects/2026-03/...` (verificado por el usuario). Si el método v3 del SDK
**no** los expone, leer asociaciones vía:
```js
const res = await hubspotClient.apiRequest({
  method: 'GET',
  path: `/crm/objects/2026-03/deals/${dealId}?associations=quotes,contacts,companies,line_items`,
});
const { associations } = await res.json();
```
y extraer los `type` desde ahí. La lógica de selección (principal / primary) es
idéntica en ambos casos.

### 5.2 Quote principal
```js
const QUOTE_PROPERTIES = ['hs_tcv', 'hs_tax_total', 'hs_quote_amount',
                          'hs_expiration_date', 'hs_last_published_date'];
const quote = await hubspotClient.crm.quotes.basicApi.getById(
  quoteId,
  QUOTE_PROPERTIES, // properties
  undefined,        // propertiesWithHistory
  undefined,        // associations
  false,            // archived
);
```
- `hs_tcv` → subtotal (válido porque las cotizaciones son de **pago único**). Se
  usa el valor de la quote tal cual; **no** se reconcilia contra la suma de line
  items.
- `hs_tax_total` → IVA (monto). La etiqueta "12%" es fija en el HTML.
- `hs_quote_amount` → total general.
- `hs_expiration_date` → vigencia. `hs_last_published_date` → fecha.
- Estas propiedades son **calculadas**; pueden venir `null` en quotes borrador o
  sin line items → tratar como vacío (§11).

### 5.3 Contacto principal
```js
const contact = await hubspotClient.crm.contacts.basicApi.getById(
  contactId, ['firstname', 'lastname', 'email', 'phone']);
```
- `phone` es un único string; mostrar tal cual (sin reformatear). Vacío → celda
  en blanco.

### 5.4 Empresa
```js
const company = await hubspotClient.crm.companies.basicApi.getById(
  companyId, ['name', 'address']);
```

### 5.5 Line items
```js
const LINE_ITEM_PROPERTIES = ['quantity', 'name', 'datos_tecnicos',
                              'description', 'price', 'amount', 'despiece'];
const resp = await hubspotClient.crm.lineItems.batchApi.read({
  inputs: ids.map((id) => ({ id })),
  properties: LINE_ITEM_PROPERTIES,
});
const lineItems = resp.results ?? [];
```
(Es el mismo patrón `batchApi.read` que ya usa `deal.service.js` hoy.)
- Límite ~100 ids por request → chunk si fuera necesario.
- `amount` viene como **string** (calculado por HubSpot, neto). Parsear con
  `parseFloat(String(value))`. Si es `null`/`undefined`/`NaN` → la celda **Total**
  de esa línea se muestra **vacía** (sin "0.00"); la fila **no** se elimina.
- `despiece`: propiedad **custom** de line item, lista desplegable de selección
  única. Devuelve el **valor interno**, que en este portal **ya es texto legible**
  ("Cubierta", "Canales", ...). Se pasa como una propiedad normal en
  `LINE_ITEM_PROPERTIES` y se usa directo como nombre de categoría (el CSS lo
  muestra en mayúsculas). **No** se requiere la Properties API.

### 5.6 Owner (asesor)
```js
// Firma verificada contra los type defs del SDK v13.5.0:
// getById(ownerId: number, idProperty?: 'id'|'userId', archived?: boolean)
const owner = await hubspotClient.crm.owners.ownersApi.getById(
  Number(hubspotOwnerId), 'id', false);
```
- `hubspot_owner_id` llega como string → convertir con `Number(...)`.
- El SDK devuelve campos **camelCase** separados: `firstName`, `lastName`,
  `email` (todos pueden ser `undefined`, p. ej. owners tipo `QUEUE`).
- El `view-model` arma el string `"Nombre Apellido (email)"` **omitiendo** las
  partes ausentes: `"John Doe (john@x.com)"`, o `"John Doe"`, o `"(john@x.com)"`,
  o `""` si no hay nada. Nunca produce "undefined".

### 5.7 Pipeline (sucursal)
```js
// getById('deals', pipelineId) devuelve el Pipeline directamente (no { results }).
const pipeline = await hubspotClient.crm.pipelines.pipelinesApi.getById(
  'deals', deal.properties.pipeline);
const sucursal = (pipeline.label ?? '').trim().split(/\s+/).pop() ?? '';
```
- Si falla / pipeline no encontrado → sucursal vacía (no abortar el PDF).

### 5.8 Zona horaria del portal
```js
const res = await hubspotClient.apiRequest({ method: 'GET', path: '/account-info/v3/details' });
if (!res.ok) throw new Error(`account-info ${res.status}`);
const account = await res.json();
const timeZone = account.timeZone || 'America/Guatemala'; // fallback
```
- **Cachear** a nivel de proceso (es global del portal y casi no cambia). No
  llamar por cada PDF.
- Si la llamada falla, degradar al fallback `'America/Guatemala'` para no abortar.

### 5.9 Guardar URL en el Deal
```js
try {
  await hubspotClient.crm.deals.basicApi.update(
    dealId, { properties: { url_de_la_ultima_cotizacion: pdf.url } });
} catch (err) {
  logger.warn({ dealId, err: err.message }, 'No se pudo guardar el URL en el deal');
}
```
- La propiedad `url_de_la_ultima_cotizacion` debe existir en el esquema del Deal
  (ya creada por el usuario). Fallo aquí → warning, **no** bloquea la respuesta.

---

## 6. Mapeo de campos (PDF → HubSpot)

| Campo PDF | Entidad | Propiedad interna | Transformación |
|-----------|---------|-------------------|----------------|
| Empresa | Company | `name` | directo |
| # Proyecto | Deal | `codigo_de_proyecto` | directo |
| Contacto | Contact (principal) | `firstname` + `lastname` | concatenar |
| Dirección Proyecto | Company | `address` | directo |
| Vigencia | Quote (principal) | `hs_expiration_date` | UTC → TZ portal → fecha |
| Tiempo entrega materiales | Deal | `tiempo_de_entrega_de_materiales` | directo |
| Tiempo de ejecución | Deal | `tiempo_de_ejecucion` | directo |
| Asesor | Deal → Owners | `hubspot_owner_id` | lookup → `Nombre Apellido (email)` |
| Obra | Deal | `obra` | directo |
| Lugar de entrega | Deal | `lugar_de_entrega` | directo |
| Moneda | Deal | `deal_currency_code` | código ISO tal cual, ej. "GTQ" (§9.2) |
| Tasa de cambio | Deal | `tasa_de_cambio` | directo |
| Garantía | Deal | `garantia` | directo |
| Fecha | Quote (principal) | `hs_last_published_date` | UTC → TZ portal → fecha |
| # Registro | Deal | `numero_de_registro` | directo |
| Teléfonos | Contact (principal) | `phone` | directo |
| Sucursal | Deal → Pipelines | `pipeline` | label → última palabra |
| Condición de pago | Deal | `condicion_de_pago` | multilínea (`\n`→`<br>`) |
| Cantidad | Line item | `quantity` | número |
| Nombre del artículo | Line item | `name` | directo |
| Datos técnicos | Line item | `datos_tecnicos` | multilínea (`\n`→`<br>`) |
| Descripción del servicio | Line item | `description` | multilínea (`\n`→`<br>`) |
| Precio unitario | Line item | `price` | moneda |
| Categoría (agrupador) | Line item | `despiece` | valor interno directo |
| Total (línea) | Line item | `amount` | parsear string → moneda (null → vacío) |
| Subtotal | Quote (principal) | `hs_tcv` | moneda |
| IVA 12% | Quote (principal) | `hs_tax_total` | moneda (etiqueta "12%" fija) |
| Total general | Quote (principal) | `hs_quote_amount` | moneda |

> Regla general: cualquier propiedad ausente (`null`/`undefined`/vacío) se
> renderiza como **celda en blanco**, sin texto placeholder (ver §11).

---

## 7. Agrupación por `despiece`

1. Recorrer los line items y agrupar por su valor de `despiece`.
2. Se consideran **sin despiece** los valores `null`, `undefined` o string vacío
   tras `trim()`. Todos esos items van al grupo **"Sin categoría"**.
3. Las claves de agrupación se comparan **tal cual** (sin normalizar mayúsculas);
   el CSS de la fila de categoría aplica `text-transform: uppercase` solo para
   mostrar.
4. Cada grupo produce una fila azul de categoría (`section-row`, `colspan=6`)
   seguida de sus items.
5. **Orden:** las categorías nombradas aparecen en **orden de aparición** (según
   el primer item de cada una). El grupo **"Sin categoría"** va **al final**.
   (El orden no es configurable desde la UI; si se requiere un orden fijo, se
   definirá en una especificación aparte.)

---

## 8. Tabla de productos (6 columnas)

```
CANTIDAD | NOMBRE DEL ARTÍCULO | DATOS TÉCNICOS | DESCRIPCIÓN DEL SERVICIO | PRECIO UNITARIO | TOTAL
```
- "Datos técnicos" se inserta **después** del nombre del artículo.
- La fila de categoría pasa a `colspan="6"`; el bloque de totales se ajusta a 6
  columnas.
- **Anchos de partida** (se ajustan visualmente en implementación, no truncar
  contenido; permitir wrap y crecer en alto):

  | CANTIDAD | NOMBRE | DATOS TÉCNICOS | DESCRIPCIÓN | PRECIO UNIT. | TOTAL |
  |---|---|---|---|---|---|
  | 8% | 24% | 22% | 22% | 12% | 12% |

---

## 9. Reglas de formateo

### 9.1 Fechas
- Los datetime de HubSpot vienen en UTC. Pueden llegar como epoch en
  milisegundos (string de 13 dígitos) o como ISO 8601.
- Parseo: si el valor es string de solo dígitos → `new Date(Number(value))`; si
  es ISO → `new Date(value)`. Si es `null`/inválido → devolver `""`.
- Formatear en la zona horaria del portal. **El mockup usa el orden
  "martes, enero 27, 2026"** (día de semana, mes, día, año) — ese orden no es el
  default de `es-GT`, así que se arma a partir de las partes:
  `Intl.DateTimeFormat('es-GT', { weekday, month, day, year, timeZone })` y se
  recomponen al orden del mockup. El resultado debe coincidir visualmente con los
  PDFs ya generados.

### 9.2 Moneda
- **Decisión final (actualizada):** se muestra el **código ISO tal cual** viene de
  HubSpot en `deal_currency_code` (`GTQ`, `USD`, …). **No** se convierte a símbolo.
- Formato: `"<código> <número>"` con número en formato es-GT (separador de miles
  `,`, 2 decimales). Ej.: `GTQ 4,391,868.00`.
- El campo "Moneda" de la sección de info muestra el código (ej. "GTQ").
- Si el deal no trae código, el monto sale solo con el número (sin prefijo).

### 9.3 Multilínea
- Campos `condicion_de_pago`, `datos_tecnicos`, `description` preservan `\n`.
  Escapar HTML **primero**, luego convertir `\n` → `<br>`. No aplanar ni eliminar
  saltos.

### 9.4 Escape
- Todo valor dinámico se escapa para no romper el HTML/PDF.

---

## 10. Paginación

Estrategia CSS (motor de Chrome vía Puppeteer), ya probada en Fase 1:
- `thead { display: table-header-group }` → encabezado de columnas se repite en
  cada página.
- `break-inside: avoid` por categoría (`<tbody>`) y por fila (`<tr>`).
- Bloque de totales en `<tbody class="totals-block">` con `break-inside: avoid`
  → subtotal/IVA/total siempre juntos.
- **Comportamiento multipágina (Opción 2 acordada):** header de Construtecho e
  info solo en la página 1; la tabla continúa en páginas siguientes repitiendo
  únicamente el encabezado de columnas.
- **Categoría más alta que una página:** `break-inside: avoid` es *best-effort*;
  si una categoría no cabe en una página, el motor la parte entre páginas, pero
  las **filas individuales nunca se cortan** (cada `<tr>` mantiene su
  `break-inside: avoid`). Es el comportamiento aceptado para esta fase.
- **Hook futuro:** contenedor final con `break-before: page` reservado para la
  última hoja de términos y condiciones (fase posterior).

---

## 11. Manejo de casos vacíos

Regla general: dato ausente → **celda en blanco**, sin texto placeholder, sin
eliminar la fila.

| Caso | Comportamiento |
|------|----------------|
| Sin contacto principal (`type: principal`) | Campos de contacto vacíos. **No** hay fallback a otro contacto |
| Sin quote principal | Subtotal / IVA / Total **vacíos** (sin cálculo de fallback) |
| Quote con propiedades calculadas en `null` | Ese campo vacío |
| Item sin `despiece` (null/vacío) | Grupo **"Sin categoría"** (idéntico a §7) |
| `amount` de línea null/NaN | Celda **Total** en blanco; la fila se mantiene |
| Sin owner / owner sin nombre/email (QUEUE) | Asesor con lo disponible; nunca "undefined"; vacío si no hay nada |
| Propiedad de Deal/Company en `null` | Celda en blanco (sin placeholder) |
| Pipeline / timezone no resueltos | Sucursal vacía / timezone fallback `America/Guatemala` |

---

## 12. Scopes requeridos (private app)

Ya presentes: contacts/deals/companies/line_items (read+write donde aplica).
**Agregar:**
- `crm.objects.quotes.read`
- `crm.objects.owners.read`
- `account-info.security.read`

`crm.objects.deals.write` (ya presente) cubre el guardado del URL.

---

## 13. A verificar durante la implementación

1. Que `basicApi.getById` v3 del SDK exponga los labels `principal` /
   `deal_to_primary_quote`; si no, usar el fallback `apiRequest` al endpoint
   `2026-03` (§5.1).
2. (Resuelto) Moneda: se muestra el código ISO tal cual; no hay mapa de símbolos.
3. Anchos de columna definitivos con datos reales largos (§8).
4. Que el orden de fecha del mockup ("martes, enero 27, 2026") quede idéntico
   (§9.1).

---

## 14. Estrategia de pruebas

- **Unitarias (view model + format.util):** funciones puras de mapeo y formateo
  (fechas con TZ, moneda, multilínea, agrupación por despiece, casos vacíos,
  owner QUEUE, amount null). Sin red.
- **Integración manual:** `POST /deals/send-quote` contra un deal real; validar
  el PDF en R2 visualmente con estos escenarios:
  - 1 categoría / varias categorías
  - muchos items para forzar multipágina
  - deal sin quote principal (totales vacíos)
  - deal sin contacto principal (contacto vacío)
  - item sin despiece (grupo "Sin categoría")
- Confirmar que el URL queda escrito en `url_de_la_ultima_cotizacion`.

---

## 15. Notas

- La instancia de Puppeteer ya usa `networkidle0` (Fase 1) para esperar imágenes.
- El template y el `format.util` no conocen HubSpot: reciben el view model ya
  resuelto y formateado.
