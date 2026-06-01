# Generación dinámica de cotización PDF — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los datos hardcodeados del PDF de cotización por datos reales de HubSpot (deal + asociaciones), agrupando los line items por `despiece`, y guardar el URL del PDF generado en el deal.

**Architecture:** Se separa la lógica en módulos de responsabilidad única: un *repository* que concentra toda la I/O con HubSpot, funciones puras de formateo y resolución de asociaciones, un *view-model* puro que transforma datos crudos en strings listos para renderizar, y el *template* que solo pinta. El `deal.service` orquesta. Las funciones puras se prueban con `node:test` (nativo de Node 24); el repository y el service se verifican con integración manual.

**Tech Stack:** Node.js 24 (ESM), Fastify, `@hubspot/api-client@13.5.0`, Puppeteer, `node:test`.

**Spec de referencia:** `docs/superpowers/specs/2026-06-01-dynamic-quote-pdf-design.md`

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `package.json` | Modificar | Agregar script `test` |
| `src/modules/deals/format.util.js` | Crear | Funciones puras: escape, multilínea, número, moneda, fecha |
| `src/modules/deals/format.util.test.js` | Crear | Tests de format.util |
| `src/modules/deals/hubspot-associations.js` | Crear | Funciones puras: resolver ids/quote principal/contacto principal |
| `src/modules/deals/hubspot-associations.test.js` | Crear | Tests de hubspot-associations |
| `src/modules/deals/quote-view-model.js` | Crear | Función pura: datos crudos HubSpot → view model |
| `src/modules/deals/quote-view-model.test.js` | Crear | Tests del view model |
| `src/modules/deals/designs/proposal.html` | Modificar | Añadir columna "Datos técnicos" (6 columnas) |
| `src/modules/deals/proposal-template.js` | Reescribir | Renderiza el view model en el HTML |
| `src/modules/deals/proposal-template.test.js` | Crear | Test estructural del render |
| `src/modules/deals/hubspot-quote.repository.js` | Crear | Toda la I/O con HubSpot |
| `src/modules/deals/deal.service.js` | Reescribir | Orquesta el flujo completo |
| `src/app/app-hsmeta.json` | Modificar | Agregar 3 scopes |

---

## Task 1: Habilitar tests con `node:test`

**Files:**
- Modify: `package.json:6-9`

- [ ] **Step 1: Agregar el script `test`**

En `package.json`, reemplazar el bloque `scripts` por:

```json
  "scripts": {
    "dev:api": "node --watch src/server.js",
    "start:api": "node src/server.js",
    "test": "node --test"
  },
```

- [ ] **Step 2: Verificar que el runner corre (sin tests aún)**

Run: `npm test`
Expected: termina sin error (mensaje tipo `tests 0` / `pass 0`). Confirma que `node --test` está disponible.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: habilitar node:test como runner de pruebas"
```

---

## Task 2: `format.util.js` (funciones puras de formateo)

**Files:**
- Create: `src/modules/deals/format.util.js`
- Test: `src/modules/deals/format.util.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/modules/deals/format.util.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  multilineToHtml,
  formatNumber,
  currencySymbol,
  formatMoney,
  formatDate,
} from './format.util.js';

test('escapeHtml escapa caracteres especiales', () => {
  assert.equal(escapeHtml('<b> & "x" \''), '&lt;b&gt; &amp; &quot;x&quot; &#039;');
  assert.equal(escapeHtml(null), '');
});

test('multilineToHtml escapa y convierte \\n en <br>', () => {
  assert.equal(multilineToHtml('a\nb'), 'a<br>b');
  assert.equal(multilineToHtml('<x>\ny'), '&lt;x&gt;<br>y');
  assert.equal(multilineToHtml(''), '');
  assert.equal(multilineToHtml(null), '');
});

test('formatNumber formatea es-GT con 2 decimales', () => {
  assert.equal(formatNumber(15600), '15,600.00');
  assert.equal(formatNumber('281.53'), '281.53');
  assert.equal(formatNumber(null), '');
  assert.equal(formatNumber('abc'), '');
});

test('currencySymbol mapea códigos conocidos y cae al código', () => {
  assert.equal(currencySymbol('GTQ'), 'Q');
  assert.equal(currencySymbol('USD'), '$');
  assert.equal(currencySymbol('EUR'), 'EUR');
  assert.equal(currencySymbol(''), '');
});

test('formatMoney antepone el símbolo', () => {
  assert.equal(formatMoney(4391868, 'GTQ'), 'Q 4,391,868.00');
  assert.equal(formatMoney('281.53', 'USD'), '$ 281.53');
  assert.equal(formatMoney(100, 'EUR'), 'EUR 100.00');
  assert.equal(formatMoney(null, 'GTQ'), '');
});

test('formatDate usa la zona del portal y el orden del mockup', () => {
  assert.equal(
    formatDate('2026-01-27T12:00:00.000Z', 'America/Guatemala'),
    'martes, enero 27, 2026',
  );
  assert.equal(formatDate(null, 'America/Guatemala'), '');
  assert.equal(formatDate('no-es-fecha', 'America/Guatemala'), '');
});
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `node --test src/modules/deals/format.util.test.js`
Expected: FAIL — no se puede importar `./format.util.js` (módulo no existe).

- [ ] **Step 3: Implementar `format.util.js`**

Crear `src/modules/deals/format.util.js`:

```js
const CURRENCY_SYMBOLS = { GTQ: 'Q', USD: '$' };
const DEFAULT_TIME_ZONE = 'America/Guatemala';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function multilineToHtml(value) {
  if (value == null || value === '') return '';
  return escapeHtml(value).replaceAll('\n', '<br>');
}

export function formatNumber(value) {
  const number = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(number)) return '';
  return new Intl.NumberFormat('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

export function currencySymbol(code) {
  if (!code) return '';
  return CURRENCY_SYMBOLS[code] ?? code;
}

export function formatMoney(value, currencyCode) {
  const number = formatNumber(value);
  if (number === '') return '';
  const symbol = currencySymbol(currencyCode);
  return symbol ? `${symbol} ${number}` : number;
}

export function formatDate(value, timeZone) {
  if (value == null || value === '') return '';
  const date = /^\d+$/.test(String(value))
    ? new Date(Number(value))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('es-GT', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: timeZone || DEFAULT_TIME_ZONE,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')}, ${get('month')} ${get('day')}, ${get('year')}`;
}
```

- [ ] **Step 4: Correr el test para ver que pasa**

Run: `node --test src/modules/deals/format.util.test.js`
Expected: PASS (todos los tests verdes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/deals/format.util.js src/modules/deals/format.util.test.js
git commit -m "feat: utilidades puras de formateo para el PDF de cotización"
```

---

## Task 3: `hubspot-associations.js` (resolución pura de asociaciones)

**Files:**
- Create: `src/modules/deals/hubspot-associations.js`
- Test: `src/modules/deals/hubspot-associations.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/modules/deals/hubspot-associations.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAssociationIds,
  resolvePrimaryQuoteId,
  resolvePrincipalContactId,
} from './hubspot-associations.js';

const associations = {
  quotes: {
    results: [
      { id: '40075783717', type: 'deal_to_quote' },
      { id: '40138586143', type: 'deal_to_quote' },
      { id: '40138586143', type: 'deal_to_primary_quote' },
    ],
  },
  contacts: {
    results: [
      { id: '221686555787', type: 'deal_to_contact' },
      { id: '224543230295', type: 'deal_to_contact' },
      { id: '224543230295', type: 'principal' },
    ],
  },
  companies: { results: [{ id: '900', type: 'deal_to_company' }] },
  line_items: {
    results: [
      { id: '1', type: 'deal_to_line_item' },
      { id: '1', type: 'deal_to_line_item' },
      { id: '2', type: 'deal_to_line_item' },
    ],
  },
};

test('getAssociationIds deduplica y acepta varias claves', () => {
  assert.deepEqual(getAssociationIds(associations, 'companies'), ['900']);
  assert.deepEqual(getAssociationIds(associations, 'line_items', 'line items'), ['1', '2']);
  assert.deepEqual(getAssociationIds({}, 'companies'), []);
});

test('resolvePrimaryQuoteId devuelve la quote con type deal_to_primary_quote', () => {
  assert.equal(resolvePrimaryQuoteId(associations), '40138586143');
  assert.equal(resolvePrimaryQuoteId({ quotes: { results: [{ id: 'x', type: 'deal_to_quote' }] } }), null);
  assert.equal(resolvePrimaryQuoteId({}), null);
});

test('resolvePrincipalContactId devuelve el contacto con type principal', () => {
  assert.equal(resolvePrincipalContactId(associations), '224543230295');
  assert.equal(resolvePrincipalContactId({ contacts: { results: [{ id: 'y', type: 'deal_to_contact' }] } }), null);
  assert.equal(resolvePrincipalContactId({}), null);
});
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `node --test src/modules/deals/hubspot-associations.test.js`
Expected: FAIL — módulo `./hubspot-associations.js` no existe.

- [ ] **Step 3: Implementar `hubspot-associations.js`**

Crear `src/modules/deals/hubspot-associations.js`:

```js
export function getAssociationIds(associations, ...keys) {
  const ids = keys.flatMap((key) =>
    (associations?.[key]?.results ?? []).map((result) => result.id),
  );
  return [...new Set(ids)];
}

export function resolvePrimaryQuoteId(associations) {
  const results = associations?.quotes?.results ?? [];
  const primary = results.find((r) => r.type === 'deal_to_primary_quote');
  return primary?.id ?? null;
}

export function resolvePrincipalContactId(associations) {
  const results = associations?.contacts?.results ?? [];
  const principal = results.find((r) => r.type === 'principal');
  return principal?.id ?? null;
}
```

- [ ] **Step 4: Correr el test para ver que pasa**

Run: `node --test src/modules/deals/hubspot-associations.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/deals/hubspot-associations.js src/modules/deals/hubspot-associations.test.js
git commit -m "feat: resolución de asociaciones de deal (quote y contacto principal)"
```

---

## Task 4: `quote-view-model.js` (mapper puro)

**Files:**
- Create: `src/modules/deals/quote-view-model.js`
- Test: `src/modules/deals/quote-view-model.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/modules/deals/quote-view-model.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuoteViewModel } from './quote-view-model.js';

function baseRaw(overrides = {}) {
  return {
    deal: {
      properties: {
        codigo_de_proyecto: 'Mw_19012026',
        tiempo_de_entrega_de_materiales: 'LAMINA - stock 50%',
        tiempo_de_ejecucion: 'Según obra',
        obra: 'MABE',
        lugar_de_entrega: 'Proyecto',
        deal_currency_code: 'GTQ',
        tasa_de_cambio: 'N/A',
        garantia: '18 meses',
        numero_de_registro: 'CSS KR18',
        condicion_de_pago: 'Anticipo 60%\nEstimaciones 40%',
        hubspot_owner_id: '65432457',
        pipeline: '123',
      },
    },
    company: { properties: { name: 'Spectrum', address: 'Escuintla' } },
    contact: { properties: { firstname: 'Karla', lastname: 'Sierra', email: 'k@x.com', phone: '37587673' } },
    quote: {
      properties: {
        hs_tcv: '4693849.80',
        hs_tax_total: '563261.98',
        hs_quote_amount: '5257111.77',
        hs_expiration_date: '2026-01-27T12:00:00.000Z',
        hs_last_published_date: '2026-01-27T12:00:00.000Z',
      },
    },
    lineItems: [
      { properties: { quantity: '15600', name: 'Cubierta KR18', datos_tecnicos: 'd1\nd2', description: 'SUMINISTRO', price: '281.53', amount: '4391868', despiece: 'Cubierta' } },
      { properties: { quantity: '1160', name: 'Flashing', description: 'SUMINISTRO', price: '69.94', amount: '81130.40', despiece: 'Cubierta' } },
      { properties: { quantity: '520', name: 'Canales', description: 'SUMINISTRO', price: '319.43', amount: '166103.60', despiece: 'Canales' } },
    ],
    owner: { firstName: 'Jorge', lastName: 'Arauz', email: 'jarauz@x.com' },
    pipelineLabel: 'Ventas Guatemala',
    timeZone: 'America/Guatemala',
    ...overrides,
  };
}

test('mapea campos de info', () => {
  const vm = buildQuoteViewModel(baseRaw());
  assert.equal(vm.empresa, 'Spectrum');
  assert.equal(vm.codigoProyecto, 'Mw_19012026');
  assert.equal(vm.contacto, 'Karla Sierra');
  assert.equal(vm.direccionProyecto, 'Escuintla');
  assert.equal(vm.asesor, 'Jorge Arauz (jarauz@x.com)');
  assert.equal(vm.moneda, 'Q');
  assert.equal(vm.sucursal, 'Guatemala');
  assert.equal(vm.fecha, 'martes, enero 27, 2026');
  assert.equal(vm.vigencia, 'martes, enero 27, 2026');
  assert.equal(vm.telefonos, '37587673');
});

test('condicion de pago (multilínea) conserva saltos como <br>', () => {
  const vm = buildQuoteViewModel(baseRaw());
  assert.equal(vm.condicionPago, 'Anticipo 60%<br>Estimaciones 40%');
});

test('tiempo de entrega (una línea) se escapa sin <br>', () => {
  const vm = buildQuoteViewModel(baseRaw());
  assert.equal(vm.tiempoEntrega, 'LAMINA - stock 50%');
});

test('agrupa line items por despiece en orden de aparición', () => {
  const vm = buildQuoteViewModel(baseRaw());
  assert.equal(vm.categories.length, 2);
  assert.equal(vm.categories[0].nombre, 'Cubierta');
  assert.equal(vm.categories[0].items.length, 2);
  assert.equal(vm.categories[1].nombre, 'Canales');
  assert.equal(vm.categories[0].items[0].cantidad, '15,600.00');
  assert.equal(vm.categories[0].items[0].precioUnitario, 'Q 281.53');
  assert.equal(vm.categories[0].items[0].total, 'Q 4,391,868.00');
  assert.equal(vm.categories[0].items[0].datosTecnicos, 'd1<br>d2');
});

test('items sin despiece van a "Sin categoría" al final', () => {
  const raw = baseRaw();
  raw.lineItems.push({ properties: { quantity: '1', name: 'Suelto', description: '', price: '10', amount: '10', despiece: '' } });
  const vm = buildQuoteViewModel(raw);
  assert.equal(vm.categories[vm.categories.length - 1].nombre, 'Sin categoría');
});

test('totales vienen de la quote', () => {
  const vm = buildQuoteViewModel(baseRaw());
  assert.equal(vm.subtotal, 'Q 4,693,849.80');
  assert.equal(vm.iva, 'Q 563,261.98');
  assert.equal(vm.totalGeneral, 'Q 5,257,111.77');
});

test('sin quote principal → totales vacíos', () => {
  const vm = buildQuoteViewModel(baseRaw({ quote: null }));
  assert.equal(vm.subtotal, '');
  assert.equal(vm.iva, '');
  assert.equal(vm.totalGeneral, '');
  assert.equal(vm.fecha, '');
  assert.equal(vm.vigencia, '');
});

test('sin contacto → contacto y teléfono vacíos', () => {
  const vm = buildQuoteViewModel(baseRaw({ contact: null }));
  assert.equal(vm.contacto, '');
  assert.equal(vm.telefonos, '');
});

test('owner QUEUE sin nombre ni email → asesor vacío', () => {
  const vm = buildQuoteViewModel(baseRaw({ owner: { firstName: undefined, lastName: undefined, email: undefined } }));
  assert.equal(vm.asesor, '');
});

test('amount nulo → total de línea vacío', () => {
  const raw = baseRaw();
  raw.lineItems = [{ properties: { quantity: '1', name: 'X', description: '', price: '10', amount: null, despiece: 'Cubierta' } }];
  const vm = buildQuoteViewModel(raw);
  assert.equal(vm.categories[0].items[0].total, '');
});
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `node --test src/modules/deals/quote-view-model.test.js`
Expected: FAIL — módulo `./quote-view-model.js` no existe.

- [ ] **Step 3: Implementar `quote-view-model.js`**

Crear `src/modules/deals/quote-view-model.js`:

```js
import {
  escapeHtml,
  multilineToHtml,
  formatNumber,
  formatMoney,
  formatDate,
  currencySymbol,
} from './format.util.js';

const SIN_CATEGORIA = 'Sin categoría';

export function buildQuoteViewModel(raw) {
  const {
    deal = {},
    company = null,
    contact = null,
    quote = null,
    lineItems = [],
    owner = null,
    pipelineLabel = '',
    timeZone = 'America/Guatemala',
  } = raw ?? {};

  const dp = deal.properties ?? {};
  const cp = company?.properties ?? {};
  const ct = contact?.properties ?? {};
  const qp = quote?.properties ?? {};
  const currencyCode = dp.deal_currency_code ?? '';

  return {
    empresa: escapeHtml(cp.name ?? ''),
    codigoProyecto: escapeHtml(dp.codigo_de_proyecto ?? ''),
    contacto: escapeHtml(buildContactName(ct)),
    direccionProyecto: escapeHtml(cp.address ?? ''),
    vigencia: escapeHtml(formatDate(qp.hs_expiration_date, timeZone)),
    tiempoEntrega: escapeHtml(dp.tiempo_de_entrega_de_materiales ?? ''),
    tiempoEjecucion: escapeHtml(dp.tiempo_de_ejecucion ?? ''),
    asesor: escapeHtml(buildOwnerLabel(owner)),
    obra: escapeHtml(dp.obra ?? ''),
    lugarEntrega: escapeHtml(dp.lugar_de_entrega ?? ''),
    moneda: escapeHtml(currencySymbol(currencyCode)),
    tasaCambio: escapeHtml(dp.tasa_de_cambio ?? ''),
    garantia: escapeHtml(dp.garantia ?? ''),
    fecha: escapeHtml(formatDate(qp.hs_last_published_date, timeZone)),
    numeroRegistro: escapeHtml(dp.numero_de_registro ?? ''),
    telefonos: escapeHtml(ct.phone ?? ''),
    sucursal: escapeHtml(lastWord(pipelineLabel)),
    condicionPago: multilineToHtml(dp.condicion_de_pago ?? ''),
    categories: buildCategories(lineItems, currencyCode),
    subtotal: quote ? formatMoney(qp.hs_tcv, currencyCode) : '',
    iva: quote ? formatMoney(qp.hs_tax_total, currencyCode) : '',
    totalGeneral: quote ? formatMoney(qp.hs_quote_amount, currencyCode) : '',
  };
}

function buildContactName(ct) {
  return [ct.firstname, ct.lastname].filter(Boolean).join(' ').trim();
}

function buildOwnerLabel(owner) {
  if (!owner) return '';
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
  const email = owner.email ?? '';
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return `(${email})`;
  return '';
}

function lastWord(label) {
  const cleaned = String(label ?? '').trim();
  if (!cleaned) return '';
  return cleaned.split(/\s+/).pop();
}

function buildCategories(lineItems, currencyCode) {
  const groups = new Map();
  const order = [];

  for (const lineItem of lineItems) {
    const p = lineItem.properties ?? {};
    const raw = (p.despiece ?? '').trim();
    const key = raw === '' ? SIN_CATEGORIA : raw;

    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }

    groups.get(key).push({
      cantidad: formatNumber(p.quantity),
      nombre: escapeHtml(p.name ?? ''),
      datosTecnicos: multilineToHtml(p.datos_tecnicos ?? ''),
      descripcion: multilineToHtml(p.description ?? ''),
      precioUnitario: formatMoney(p.price, currencyCode),
      total: formatMoney(p.amount, currencyCode),
    });
  }

  const named = order.filter((key) => key !== SIN_CATEGORIA);
  const ordered = groups.has(SIN_CATEGORIA) ? [...named, SIN_CATEGORIA] : named;

  return ordered.map((name) => ({
    nombre: escapeHtml(name),
    items: groups.get(name),
  }));
}
```

- [ ] **Step 4: Correr el test para ver que pasa**

Run: `node --test src/modules/deals/quote-view-model.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/deals/quote-view-model.js src/modules/deals/quote-view-model.test.js
git commit -m "feat: view model puro de la cotización a partir de datos de HubSpot"
```

---

## Task 5: `proposal.html` — columna "Datos técnicos" (6 columnas)

**Files:**
- Modify: `src/modules/deals/designs/proposal.html`

> Esta es una plantilla HTML estática; se verifica visualmente, no con unit test.

- [ ] **Step 1: Actualizar anchos de columna en el CSS**

En `src/modules/deals/designs/proposal.html`, localizar el bloque:

```css
      /* Anchos de columna */
      .quote-table .col-qty { width: 10%; }
      .quote-table .col-name { width: 30%; }
      .quote-table .col-desc { width: 26%; }
      .quote-table .col-price { width: 17%; }
      .quote-table .col-total { width: 17%; }
```

y reemplazarlo por (añade `col-tech` y rebalancea a 6 columnas, §8 del spec):

```css
      /* Anchos de columna */
      .quote-table .col-qty { width: 8%; }
      .quote-table .col-name { width: 24%; }
      .quote-table .col-tech { width: 22%; }
      .quote-table .col-desc { width: 22%; }
      .quote-table .col-price { width: 12%; }
      .quote-table .col-total { width: 12%; }
```

- [ ] **Step 2: Añadir el `<th>` de "Datos técnicos" en el encabezado**

Localizar el `<thead>` de la tabla:

```html
          <thead>
            <tr>
              <th class="col-qty">CANTIDAD</th>
              <th class="col-name">NOMBRE DEL ARTÍCULO</th>
              <th class="col-desc">DESCRIPCIÓN DEL SERVICIO</th>
              <th class="col-price">PRECIO UNITARIO</th>
              <th class="col-total">TOTAL</th>
            </tr>
          </thead>
```

y reemplazarlo por:

```html
          <thead>
            <tr>
              <th class="col-qty">CANTIDAD</th>
              <th class="col-name">NOMBRE DEL ARTÍCULO</th>
              <th class="col-tech">DATOS TÉCNICOS</th>
              <th class="col-desc">DESCRIPCIÓN DEL SERVICIO</th>
              <th class="col-price">PRECIO UNITARIO</th>
              <th class="col-total">TOTAL</th>
            </tr>
          </thead>
```

- [ ] **Step 3: Ajustar el `colspan` del bloque de totales de 3 a 4**

Localizar el `<tbody class="totals-block">` y cambiar los tres `colspan="3"` a `colspan="4"` (para empujar las etiquetas a la 5.ª columna y los valores a la 6.ª):

```html
          <tbody class="totals-block">
            <tr class="totals-row">
              <td colspan="4" style="border: none;"></td>
              <td>SUBTOTAL</td>
              <td class="text-right">{{subtotal}}</td>
            </tr>
            <tr class="totals-row">
              <td colspan="4" style="border: none;"></td>
              <td>IVA 12%</td>
              <td class="text-right">{{tax}}</td>
            </tr>
            <tr class="grand-total">
              <td colspan="4" style="border: none;"></td>
              <td>TOTAL GENERAL</td>
              <td class="text-right">{{grandTotal}}</td>
            </tr>
          </tbody>
```

- [ ] **Step 4: Verificar que no queden referencias a 5 columnas**

Run: `grep -n "colspan=\"5\"" src/modules/deals/designs/proposal.html`
Expected: sin resultados (la fila de categoría se genera por JS en Task 6 con `colspan="6"`; no debe quedar ningún `colspan="5"` en el HTML estático).

- [ ] **Step 5: Commit**

```bash
git add src/modules/deals/designs/proposal.html
git commit -m "feat: columna Datos técnicos en la tabla de productos (6 columnas)"
```

---

## Task 6: `proposal-template.js` — renderizar el view model

**Files:**
- Reescribir: `src/modules/deals/proposal-template.js`
- Test: `src/modules/deals/proposal-template.test.js`

- [ ] **Step 1: Escribir el test estructural que falla**

Crear `src/modules/deals/proposal-template.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProposalHtml } from './proposal-template.js';

const viewModel = {
  empresa: 'Spectrum',
  codigoProyecto: 'Mw_19012026',
  contacto: 'Karla Sierra',
  direccionProyecto: 'Escuintla',
  vigencia: 'martes, enero 27, 2026',
  tiempoEntrega: 'línea1<br>línea2',
  tiempoEjecucion: 'Según obra',
  asesor: 'Jorge Arauz (jarauz@x.com)',
  obra: 'MABE',
  lugarEntrega: 'Proyecto',
  moneda: 'Q',
  tasaCambio: 'N/A',
  garantia: '18 meses',
  fecha: 'martes, enero 27, 2026',
  numeroRegistro: 'CSS KR18',
  telefonos: '37587673',
  sucursal: 'Guatemala',
  condicionPago: 'Anticipo 60%<br>Estimaciones 40%',
  categories: [
    { nombre: 'Cubierta', items: [
      { cantidad: '15,600.00', nombre: 'Cubierta KR18', datosTecnicos: 'd1<br>d2', descripcion: 'SUMINISTRO', precioUnitario: 'Q 281.53', total: 'Q 4,391,868.00' },
    ]},
  ],
  subtotal: 'Q 4,693,849.80',
  iva: 'Q 563,261.98',
  totalGeneral: 'Q 5,257,111.77',
};

test('el HTML resultante no deja placeholders sin reemplazar', async () => {
  const html = await buildProposalHtml(viewModel);
  assert.ok(!html.includes('{{'), 'no debe quedar ningún {{placeholder}}');
});

test('el HTML incluye categoría e items con 6 celdas', async () => {
  const html = await buildProposalHtml(viewModel);
  assert.ok(html.includes('Spectrum'));
  assert.ok(html.includes('colspan="6"'));
  assert.ok(html.includes('Cubierta KR18'));
  assert.ok(html.includes('Q 4,391,868.00'));
  assert.ok(html.includes('d1<br>d2'));
});

test('renderiza con categories vacío sin error', async () => {
  const html = await buildProposalHtml({ ...viewModel, categories: [] });
  assert.ok(!html.includes('{{'));
});
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `node --test src/modules/deals/proposal-template.test.js`
Expected: FAIL — `buildProposalHtml(viewModel)` aún espera la firma antigua (sin argumentos / MOCK_DATA), así que quedan `{{` o falta `colspan="6"`.

- [ ] **Step 3: Reescribir `proposal-template.js`**

Reemplazar **todo** el contenido de `src/modules/deals/proposal-template.js` por:

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'designs/proposal.html',
);

/**
 * Renderiza el HTML de la propuesta a partir del view model.
 * Todos los valores del view model ya vienen escapados / formateados.
 */
export async function buildProposalHtml(viewModel) {
  const template = await readFile(TEMPLATE_PATH, 'utf8');
  return template
    .replaceAll('{{companyName}}', viewModel.empresa)
    .replaceAll('{{projectNumber}}', viewModel.codigoProyecto)
    .replaceAll('{{contactName}}', viewModel.contacto)
    .replaceAll('{{projectAddress}}', viewModel.direccionProyecto)
    .replaceAll('{{validity}}', viewModel.vigencia)
    .replaceAll('{{deliveryTime}}', viewModel.tiempoEntrega)
    .replaceAll('{{executionTime}}', viewModel.tiempoEjecucion)
    .replaceAll('{{advisorName}}', viewModel.asesor)
    .replaceAll('{{workName}}', viewModel.obra)
    .replaceAll('{{deliveryPlace}}', viewModel.lugarEntrega)
    .replaceAll('{{currency}}', viewModel.moneda)
    .replaceAll('{{exchangeRate}}', viewModel.tasaCambio)
    .replaceAll('{{warranty}}', viewModel.garantia)
    .replaceAll('{{date}}', viewModel.fecha)
    .replaceAll('{{registryNumber}}', viewModel.numeroRegistro)
    .replaceAll('{{phones}}', viewModel.telefonos)
    .replaceAll('{{branch}}', viewModel.sucursal)
    .replaceAll('{{paymentCondition}}', viewModel.condicionPago)
    .replaceAll('{{lineItemRows}}', buildCategoryRows(viewModel.categories))
    .replaceAll('{{subtotal}}', viewModel.subtotal)
    .replaceAll('{{tax}}', viewModel.iva)
    .replaceAll('{{grandTotal}}', viewModel.totalGeneral);
}

/**
 * Genera un <tbody> por categoría con su fila de sección y sus items.
 * Cada categoría va en su propio <tbody> para que CSS aplique
 * break-inside: avoid por grupo.
 */
function buildCategoryRows(categories) {
  if (!categories || categories.length === 0) {
    return '';
  }

  return categories
    .map((category) => {
      const sectionRow = `
        <tr class="section-row">
          <td colspan="6">${category.nombre}</td>
        </tr>`;

      const itemRows = category.items
        .map(
          (item) => `
          <tr>
            <td>${item.cantidad}</td>
            <td><strong>${item.nombre}</strong></td>
            <td>${item.datosTecnicos}</td>
            <td>${item.descripcion}</td>
            <td class="text-right">${item.precioUnitario}</td>
            <td class="text-right">${item.total}</td>
          </tr>`,
        )
        .join('');

      return `<tbody>${sectionRow}${itemRows}</tbody>`;
    })
    .join('');
}
```

- [ ] **Step 4: Correr el test para ver que pasa**

Run: `node --test src/modules/deals/proposal-template.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/deals/proposal-template.js src/modules/deals/proposal-template.test.js
git commit -m "feat: el template de propuesta consume el view model dinámico"
```

---

## Task 7: `hubspot-quote.repository.js` (I/O con HubSpot)

**Files:**
- Create: `src/modules/deals/hubspot-quote.repository.js`

> Capa de I/O: se verifica con integración manual (Task 10), no con unit test.

- [ ] **Step 1: Implementar el repository**

Crear `src/modules/deals/hubspot-quote.repository.js`:

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
const QUOTE_PROPERTIES = [
  'hs_tcv',
  'hs_tax_total',
  'hs_quote_amount',
  'hs_expiration_date',
  'hs_last_published_date',
];
const CONTACT_PROPERTIES = ['firstname', 'lastname', 'email', 'phone'];
const COMPANY_PROPERTIES = ['name', 'address'];
const LINE_ITEM_PROPERTIES = [
  'quantity',
  'name',
  'datos_tecnicos',
  'description',
  'price',
  'amount',
  'despiece',
];
const DEFAULT_TIME_ZONE = 'America/Guatemala';

export function createHubspotQuoteRepository({ hubspotClient, logger }) {
  let cachedTimeZone = null;

  // Se usa el endpoint dado 2026-03 vía apiRequest porque es el verificado
  // que devuelve los labels de asociación (principal / deal_to_primary_quote).
  async function getDeal(dealId) {
    const query =
      `properties=${DEAL_PROPERTIES.join(',')}` +
      `&associations=quotes,contacts,companies,line_items`;
    const res = await hubspotClient.apiRequest({
      method: 'GET',
      path: `/crm/objects/2026-03/deals/${dealId}?${query}`,
    });
    if (!res.ok) {
      throw new Error(`HubSpot deal fetch failed: ${res.status}`);
    }
    return res.json();
  }

  async function getQuote(quoteId) {
    return hubspotClient.crm.quotes.basicApi.getById(
      quoteId,
      QUOTE_PROPERTIES,
      undefined,
      undefined,
      false,
    );
  }

  async function getContact(contactId) {
    return hubspotClient.crm.contacts.basicApi.getById(
      contactId,
      CONTACT_PROPERTIES,
    );
  }

  async function getCompany(companyId) {
    return hubspotClient.crm.companies.basicApi.getById(
      companyId,
      COMPANY_PROPERTIES,
    );
  }

  async function getLineItems(ids) {
    if (!ids || ids.length === 0) {
      return [];
    }
    const response = await hubspotClient.crm.lineItems.batchApi.read({
      inputs: ids.map((id) => ({ id })),
      properties: LINE_ITEM_PROPERTIES,
    });
    return response.results ?? [];
  }

  async function getOwner(ownerId) {
    return hubspotClient.crm.owners.ownersApi.getById(
      Number(ownerId),
      'id',
      false,
    );
  }

  async function getPipelineLabel(pipelineId) {
    const pipeline = await hubspotClient.crm.pipelines.pipelinesApi.getById(
      'deals',
      pipelineId,
    );
    return pipeline.label ?? '';
  }

  async function getPortalTimeZone() {
    if (cachedTimeZone) {
      return cachedTimeZone;
    }
    const res = await hubspotClient.apiRequest({
      method: 'GET',
      path: '/account-info/v3/details',
    });
    if (!res.ok) {
      return DEFAULT_TIME_ZONE;
    }
    const account = await res.json();
    cachedTimeZone = account.timeZone || DEFAULT_TIME_ZONE;
    return cachedTimeZone;
  }

  async function saveQuoteUrl(dealId, url) {
    try {
      await hubspotClient.crm.deals.basicApi.update(dealId, {
        properties: { url_de_la_ultima_cotizacion: url },
      });
    } catch (err) {
      logger.warn(
        { dealId, err: err.message },
        'No se pudo guardar el URL de la cotización en el deal',
      );
    }
  }

  return {
    getDeal,
    getQuote,
    getContact,
    getCompany,
    getLineItems,
    getOwner,
    getPipelineLabel,
    getPortalTimeZone,
    saveQuoteUrl,
  };
}
```

- [ ] **Step 2: Verificar que el módulo carga sin errores de sintaxis**

Run: `node --input-type=module -e "import('./src/modules/deals/hubspot-quote.repository.js').then(m => console.log(typeof m.createHubspotQuoteRepository))"`
Expected: imprime `function`.

- [ ] **Step 3: Commit**

```bash
git add src/modules/deals/hubspot-quote.repository.js
git commit -m "feat: repository de HubSpot para datos de la cotización"
```

---

## Task 8: `deal.service.js` — orquestación del flujo

**Files:**
- Reescribir: `src/modules/deals/deal.service.js`

> Capa de orquestación con I/O: se verifica con integración manual (Task 10).

- [ ] **Step 1: Reescribir `deal.service.js`**

Reemplazar **todo** el contenido de `src/modules/deals/deal.service.js` por:

```js
import { Client } from '@hubspot/api-client';
import puppeteer from 'puppeteer';
import { badRequest, serverError } from '../../utils/errors.js';
import { buildProposalHtml } from './proposal-template.js';
import { buildQuoteViewModel } from './quote-view-model.js';
import { createHubspotQuoteRepository } from './hubspot-quote.repository.js';
import {
  getAssociationIds,
  resolvePrimaryQuoteId,
  resolvePrincipalContactId,
} from './hubspot-associations.js';

const DEFAULT_TIME_ZONE = 'America/Guatemala';

export function createDealService({ hubspotAccessToken, logger, storage }) {
  const hubspotClient = hubspotAccessToken
    ? new Client({ accessToken: hubspotAccessToken, numberOfApiCallRetries: 3 })
    : null;
  const repo = hubspotClient
    ? createHubspotQuoteRepository({ hubspotClient, logger })
    : null;

  async function sendQuote(dealId) {
    if (!dealId) {
      throw badRequest('dealId is required');
    }
    if (!repo) {
      throw serverError(
        'HubSpot access token is required. Set HUBSPOT_ACCESS_TOKEN or HUBSPOT_PRIVATE_APP_TOKEN.',
      );
    }

    logger.info({ dealId }, 'Fetching deal data from HubSpot');

    const deal = await repo.getDeal(dealId);
    const associations = deal.associations ?? {};
    const primaryQuoteId = resolvePrimaryQuoteId(associations);
    const principalContactId = resolvePrincipalContactId(associations);
    const companyId = getAssociationIds(associations, 'companies')[0] ?? null;
    const lineItemIds = getAssociationIds(associations, 'line_items', 'line items');
    const ownerId = deal.properties?.hubspot_owner_id ?? null;
    const pipelineId = deal.properties?.pipeline ?? null;

    const [quote, contact, company, lineItems, owner, pipelineLabel, timeZone] =
      await Promise.all([
        primaryQuoteId ? repo.getQuote(primaryQuoteId) : null,
        principalContactId ? repo.getContact(principalContactId) : null,
        companyId ? repo.getCompany(companyId) : null,
        repo.getLineItems(lineItemIds),
        ownerId
          ? repo.getOwner(ownerId).catch((err) => {
              logger.warn({ ownerId, err: err.message }, 'owner lookup failed');
              return null;
            })
          : null,
        pipelineId
          ? repo.getPipelineLabel(pipelineId).catch((err) => {
              logger.warn({ pipelineId, err: err.message }, 'pipeline lookup failed');
              return '';
            })
          : '',
        repo.getPortalTimeZone().catch(() => DEFAULT_TIME_ZONE),
      ]);

    const viewModel = buildQuoteViewModel({
      deal,
      company,
      contact,
      quote,
      lineItems,
      owner,
      pipelineLabel,
      timeZone,
    });

    const html = await buildProposalHtml(viewModel);
    const pdf = await createProposalPdf(html, dealId, storage);
    await repo.saveQuoteUrl(dealId, pdf.url);

    logger.info({ dealId, url: pdf.url }, 'Quote PDF generated');

    return {
      dealId,
      generatedAt: new Date().toISOString(),
      pdf: { key: pdf.key, url: pdf.url },
    };
  }

  return { sendQuote };
}

async function createProposalPdf(html, dealId, storage) {
  if (!storage) {
    throw serverError('R2 storage plugin is required to upload proposal PDFs.');
  }

  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-crash-reporter',
      '--disable-crashpad',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, {
      timeout: 15000,
      waitUntil: 'networkidle0',
    });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
    });
    const key = `quotes/propuesta-${dealId}-${Date.now()}.pdf`;
    return storage.uploadPdf({ key, body: pdfBuffer });
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 2: Verificar que toda la suite de tests sigue verde**

Run: `npm test`
Expected: PASS (format.util, hubspot-associations, quote-view-model, proposal-template).

- [ ] **Step 3: Verificar que el módulo carga sin errores**

Run: `node --input-type=module -e "import('./src/modules/deals/deal.service.js').then(m => console.log(typeof m.createDealService))"`
Expected: imprime `function`.

- [ ] **Step 4: Commit**

```bash
git add src/modules/deals/deal.service.js
git commit -m "feat: orquestar generación de cotización con datos reales de HubSpot"
```

---

## Task 9: Agregar scopes en `app-hsmeta.json`

**Files:**
- Modify: `src/app/app-hsmeta.json`

- [ ] **Step 1: Añadir los 3 scopes faltantes**

En `src/app/app-hsmeta.json`, dentro de `config.auth.requiredScopes`, agregar estos tres elementos al arreglo (junto a los existentes):

```json
        "crm.objects.quotes.read",
        "crm.objects.owners.read",
        "account-info.security.read"
```

- [ ] **Step 2: Validar que el JSON sigue siendo válido**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/app/app-hsmeta.json','utf8')); console.log('json ok')"`
Expected: imprime `json ok`.

- [ ] **Step 3: Commit**

```bash
git add src/app/app-hsmeta.json
git commit -m "chore: agregar scopes de quotes, owners y account-info"
```

> **Nota:** los scopes también deben estar concedidos en la private app de HubSpot
> (Settings → Integrations → Private Apps → Scopes) y el token regenerado en `.env`.

---

## Task 10: Verificación de integración (manual)

**Files:** ninguno (validación end-to-end).

- [ ] **Step 1: Confirmar prerequisitos**

- `.env` con `HUBSPOT_ACCESS_TOKEN` (token con los scopes nuevos), credenciales R2.
- Propiedad `url_de_la_ultima_cotizacion` existe en el objeto Deal.
- Un `dealId` real con quote principal, contacto principal, empresa y line items con `despiece`.

- [ ] **Step 2: Levantar el servidor**

Run: `npm run dev:api`
Expected: `Server listening at http://127.0.0.1:3000`.

- [ ] **Step 3: Llamar al endpoint con un deal real**

Run (en otra terminal, reemplazar el id):
```bash
curl -X POST http://localhost:3000/deals/send-quote \
  -H "Content-Type: application/json" \
  -d '{"dealId": "60257771792"}'
```
Expected: JSON `{ "dealId": "...", "generatedAt": "...", "pdf": { "key": "...", "url": "https://...r2.dev/quotes/propuesta-...pdf" } }`.

- [ ] **Step 4: Validar el PDF visualmente**

Abrir el `pdf.url` y confirmar contra el mockup:
- Header (logo + título + certificaciones) e info con datos reales.
- Productos agrupados por `despiece` (fila azul por categoría) con 6 columnas, incl. "Datos técnicos".
- Subtotal / IVA 12% / Total General con los valores de la quote.
- Fechas en zona horaria del portal con el orden "martes, enero 27, 2026".

- [ ] **Step 5: Validar el writeback**

En HubSpot, abrir el deal y confirmar que `url_de_la_ultima_cotizacion` contiene el URL del PDF recién generado.

- [ ] **Step 6: Probar escenarios de borde**

- Deal con **muchos** line items (forzar multipágina): el encabezado de columnas se repite, no se cortan filas, los totales quedan juntos.
- Deal **sin quote principal**: subtotal/IVA/total salen vacíos, el resto se genera.
- Deal **sin contacto principal**: campos de contacto vacíos.
- Line item **sin despiece**: aparece en el grupo "Sin categoría" al final.

- [ ] **Step 7 (si aplica): Verificar el fallback de labels de asociación**

Si en el Step 3/4 el contacto principal o la quote principal no se resolvieron
(porque el SDK no expuso los labels), confirmar que `getDeal` (que usa el endpoint
`2026-03` vía `apiRequest`) sí los trae. Inspeccionar la respuesta cruda de
`getDeal` agregando temporalmente `logger.info({ associations: deal.associations })`
en `deal.service.js` y revisar que vengan los `type: 'principal'` /
`type: 'deal_to_primary_quote'`. Quitar el log temporal antes del commit final.

---

## Self-review (cobertura del spec)

- §3 flujo de datos → Tasks 7, 8 (orquestación + repository).
- §4 estructura de código → Tasks 2, 3, 4, 6, 7, 8 (cada módulo).
- §5 consultas HubSpot → Task 7 (repository) + Task 8 (resolución y orquestación).
- §6 mapeo de campos → Task 4 (view model).
- §7 agrupación por despiece → Task 4 (`buildCategories`, "Sin categoría" al final).
- §8 tabla 6 columnas → Tasks 5 (HTML) y 6 (render).
- §9 formateo (fecha/moneda/multilínea) → Task 2 (format.util) + Task 4 (uso).
- §10 paginación → ya implementada en el CSS de `proposal.html` (Fase 1); Task 5 conserva las reglas; Task 10 verifica multipágina.
- §11 casos vacíos → Task 4 (tests de quote nula, contacto nulo, owner QUEUE, amount nulo) + Task 8 (catch de owner/pipeline/timezone).
- §12 scopes → Task 9.
- §13 verificaciones → Task 10 (steps 4, 7).
- §14 pruebas → Tasks 2-6 (unitarias) + Task 10 (integración).
```
