# Ajustes al PDF: TLD por sucursal, vigencia en días y contacto por defecto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cambiar tres campos del PDF de cotización — el TLD del URL según la sucursal, la vigencia (valor literal de una propiedad del deal + " días") y la selección de contacto (usar el único contacto cuando hay uno solo).

**Architecture:** Cambios acotados a tres funciones puras (`hubspot-associations.js`, `quote-view-model.js`, `proposal-template.js`), su plantilla (`designs/proposal.html`) y la lista de propiedades del repositorio (`hubspot-quote.repository.js`). Sin llamadas nuevas a HubSpot; de hecho se deja de pedir `hs_expiration_date`. Todo cubierto por tests `node:test`.

**Tech Stack:** Node.js (ESM), `node:test` + `node:assert/strict`, Fastify, Puppeteer (sin tocar).

**Spec:** `docs/superpowers/specs/2026-06-04-ajustes-pdf-tld-vigencia-contacto-design.md`

**Comando de pruebas:** `node --test` (todo) o `node --test <archivo>` (un archivo).

---

## File Structure

| Archivo | Responsabilidad | Cambio |
|---------|-----------------|--------|
| `src/modules/deals/hubspot-associations.js` | Resolver ids de asociación (puro) | Nueva lógica `resolvePrincipalContactId` |
| `src/modules/deals/hubspot-associations.test.js` | Tests de asociaciones | Casos de la tabla de contacto |
| `src/modules/deals/quote-view-model.js` | Datos crudos → view model (puro) | `siteTld` + `vigencia` literal |
| `src/modules/deals/quote-view-model.test.js` | Tests del view model | Casos de `siteTld` y `vigencia` |
| `src/modules/deals/proposal-template.js` | Rellena el HTML | `replaceAll('{{siteTld}}', …)` |
| `src/modules/deals/proposal-template.test.js` | Tests de la plantilla | `siteTld` en fixture + URL |
| `src/modules/deals/designs/proposal.html` | Plantilla del PDF | URL → `construtecho.com.{{siteTld}}` |
| `src/modules/deals/hubspot-quote.repository.js` | I/O con HubSpot | +`vigencia_en_dias`, −`hs_expiration_date` |
| `docs/ESTADO-Y-PENDIENTES.md` | Handoff | Mapeo de campos §5 |

---

## Task 1: Cambio 4 — contacto por defecto cuando hay uno solo

**Files:**
- Modify: `src/modules/deals/hubspot-associations.js`
- Test: `src/modules/deals/hubspot-associations.test.js`

Tabla de decisión (conteo por **id único**):

| Situación | Resultado |
|---|---|
| 0 contactos | `null` |
| 1 contacto (con o sin etiqueta) | ese contacto |
| 2+ contactos, exactamente 1 con `principal` | el `principal` |
| 2+ contactos, ninguno con `principal` | `null` |
| 2+ contactos, 2+ con `principal` | `null` |

- [ ] **Step 1: Reemplazar el test de `resolvePrincipalContactId` por la tabla completa**

En `src/modules/deals/hubspot-associations.test.js`, reemplaza el test existente (el bloque `test('resolvePrincipalContactId devuelve el contacto con type principal', …)`) por estos seis tests:

```js
test('resolvePrincipalContactId: 2+ contactos usa el que tiene principal', () => {
  assert.equal(resolvePrincipalContactId(associations), '224543230295');
});

test('resolvePrincipalContactId: sin contactos → null', () => {
  assert.equal(resolvePrincipalContactId({}), null);
  assert.equal(resolvePrincipalContactId({ contacts: { results: [] } }), null);
});

test('resolvePrincipalContactId: un solo contacto sin etiqueta principal → ese contacto', () => {
  assert.equal(
    resolvePrincipalContactId({ contacts: { results: [{ id: 'y', type: 'deal_to_contact' }] } }),
    'y',
  );
});

test('resolvePrincipalContactId: un contacto con dos etiquetas (dos filas, mismo id) → ese contacto', () => {
  assert.equal(
    resolvePrincipalContactId({
      contacts: {
        results: [
          { id: 'z', type: 'deal_to_contact' },
          { id: 'z', type: 'principal' },
        ],
      },
    }),
    'z',
  );
});

test('resolvePrincipalContactId: 2+ contactos, ninguno principal → null', () => {
  assert.equal(
    resolvePrincipalContactId({
      contacts: {
        results: [
          { id: 'a', type: 'deal_to_contact' },
          { id: 'b', type: 'deal_to_contact' },
        ],
      },
    }),
    null,
  );
});

test('resolvePrincipalContactId: 2+ contactos, dos con principal → null (ambiguo)', () => {
  assert.equal(
    resolvePrincipalContactId({
      contacts: {
        results: [
          { id: 'a', type: 'principal' },
          { id: 'b', type: 'principal' },
        ],
      },
    }),
    null,
  );
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `node --test src/modules/deals/hubspot-associations.test.js`
Expected: FAIL. El caso "un solo contacto sin etiqueta principal → ese contacto" falla porque la implementación actual devuelve `null` cuando no hay `principal` (esperaba `'y'`, recibió `null`).

- [ ] **Step 3: Implementar la nueva lógica**

En `src/modules/deals/hubspot-associations.js`, reemplaza la función `resolvePrincipalContactId` por:

```js
export function resolvePrincipalContactId(associations) {
  const results = associations?.contacts?.results ?? [];
  const uniqueIds = [...new Set(results.map((r) => r.id))];

  if (uniqueIds.length === 0) return null;
  if (uniqueIds.length === 1) return uniqueIds[0];

  // 2+ contactos: usar el principal solo si hay exactamente uno con esa etiqueta.
  const principalIds = [
    ...new Set(results.filter((r) => r.type === 'principal').map((r) => r.id)),
  ];
  return principalIds.length === 1 ? principalIds[0] : null;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `node --test src/modules/deals/hubspot-associations.test.js`
Expected: PASS (todos los tests del archivo).

- [ ] **Step 5: Commit**

```bash
git add src/modules/deals/hubspot-associations.js src/modules/deals/hubspot-associations.test.js
git commit -m "feat: usar el contacto único por defecto cuando el deal tiene uno solo"
```

---

## Task 2: Cambio 1 — TLD del URL del PDF según la sucursal

**Files:**
- Modify: `src/modules/deals/quote-view-model.js`
- Modify: `src/modules/deals/proposal-template.js`
- Modify: `src/modules/deals/designs/proposal.html`
- Test: `src/modules/deals/quote-view-model.test.js`
- Test: `src/modules/deals/proposal-template.test.js`

### Parte A — el view model produce `siteTld`

- [ ] **Step 1: Agregar el test de `siteTld` al view model**

En `src/modules/deals/quote-view-model.test.js`, agrega este test (puede ir al final del archivo):

```js
test('siteTld se deriva de la sucursal (mapa único, default gt)', () => {
  assert.equal(buildQuoteViewModel(baseRaw()).siteTld, 'gt'); // pipelineLabel 'Ventas Guatemala'
  assert.equal(buildQuoteViewModel(baseRaw({ pipelineLabel: 'Ventas Honduras' })).siteTld, 'hn');
  assert.equal(buildQuoteViewModel(baseRaw({ pipelineLabel: 'Ventas HONDURAS' })).siteTld, 'hn');
  assert.equal(buildQuoteViewModel(baseRaw({ pipelineLabel: 'Ventas Panamá' })).siteTld, 'gt'); // no mapeado → default
  assert.equal(buildQuoteViewModel(baseRaw({ pipelineLabel: '' })).siteTld, 'gt');
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test src/modules/deals/quote-view-model.test.js`
Expected: FAIL. `vm.siteTld` es `undefined` (campo inexistente), esperaba `'gt'`.

- [ ] **Step 3: Implementar el mapa y el campo `siteTld`**

En `src/modules/deals/quote-view-model.js`, justo después de la línea `const SIN_CATEGORIA = 'Sin categoría';`, agrega:

```js
const SUCURSAL_TLD = {
  guatemala: 'gt',
  honduras: 'hn',
};
const DEFAULT_TLD = 'gt';

function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function tldForSucursal(sucursal) {
  return SUCURSAL_TLD[normalizeKey(sucursal)] ?? DEFAULT_TLD;
}
```

Y en el objeto que retorna `buildQuoteViewModel`, agrega la línea `siteTld` justo después de la línea `sucursal:`:

```js
    sucursal: escapeHtml(lastWord(pipelineLabel)),
    siteTld: tldForSucursal(lastWord(pipelineLabel)),
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test src/modules/deals/quote-view-model.test.js`
Expected: PASS.

### Parte B — la plantilla consume `siteTld`

- [ ] **Step 5: Agregar `siteTld` al fixture y un test de URL en la plantilla**

En `src/modules/deals/proposal-template.test.js`, agrega `siteTld: 'gt',` al objeto `viewModel` (por ejemplo, justo después de la línea `sucursal: 'Guatemala',`). Luego agrega este test al final:

```js
test('el URL del PDF usa el TLD de la sucursal', async () => {
  const html = await buildProposalHtml({ ...viewModel, siteTld: 'hn' });
  assert.ok(html.includes('href="https://construtecho.com.hn"'));
  assert.ok(html.includes('www.construtecho.com.hn'));
  assert.ok(!html.includes('construtecho.com.gt'));
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `node --test src/modules/deals/proposal-template.test.js`
Expected: FAIL. El HTML aún tiene el URL fijo `construtecho.com.gt`; no contiene `construtecho.com.hn`.

- [ ] **Step 7: Templatizar el TLD en el HTML y reemplazarlo en la plantilla**

En `src/modules/deals/designs/proposal.html`, reemplaza la línea (dentro del header, lista del título):

```html
            <li><a href="https://construtecho.com.gt">www.construtecho.com.gt</a></li>
```

por:

```html
            <li><a href="https://construtecho.com.{{siteTld}}">www.construtecho.com.{{siteTld}}</a></li>
```

En `src/modules/deals/proposal-template.js`, agrega un `replaceAll` justo después de la línea `.replaceAll('{{branch}}', viewModel.sucursal)`:

```js
    .replaceAll('{{siteTld}}', viewModel.siteTld)
```

- [ ] **Step 8: Correr el test y verificar que pasa**

Run: `node --test src/modules/deals/proposal-template.test.js`
Expected: PASS (incluye el test existente "no deja placeholders sin reemplazar", que sigue pasando porque el fixture ahora trae `siteTld`).

- [ ] **Step 9: Commit**

```bash
git add src/modules/deals/quote-view-model.js src/modules/deals/quote-view-model.test.js src/modules/deals/proposal-template.js src/modules/deals/proposal-template.test.js src/modules/deals/designs/proposal.html
git commit -m "feat: derivar el TLD del URL del PDF según la sucursal"
```

---

## Task 3: Cambio 2 — vigencia = valor literal de `vigencia_en_dias` + " días"

**Files:**
- Modify: `src/modules/deals/quote-view-model.js`
- Modify: `src/modules/deals/hubspot-quote.repository.js`
- Test: `src/modules/deals/quote-view-model.test.js`

### Parte A — el view model calcula `vigencia`

- [ ] **Step 1: Ajustar el fixture y los tests de `vigencia` en el view model**

En `src/modules/deals/quote-view-model.test.js`:

1. Agrega `vigencia_en_dias: '15',` dentro de `baseRaw().deal.properties` (por ejemplo, después de la línea `garantia: '18 meses',`).

2. En el test `test('mapea campos de info', …)`, cambia la aserción de vigencia:

```js
  assert.equal(vm.vigencia, '15 días');
```

3. En el test `test('sin quote principal → totales vacíos', …)`, cambia la línea de vigencia para documentar que ya **no** depende de la quote (sigue saliendo del deal):

```js
  assert.equal(vm.vigencia, '15 días');
```

(Deja intacta la aserción `assert.equal(vm.fecha, '');` de ese mismo test: `fecha` sí depende de la quote.)

4. Agrega dos tests nuevos al final:

```js
test('vigencia = valor literal + " días"', () => {
  const raw = baseRaw();
  raw.deal.properties.vigencia_en_dias = '30';
  assert.equal(buildQuoteViewModel(raw).vigencia, '30 días');
});

test('vigencia vacía si vigencia_en_dias está vacío', () => {
  const raw = baseRaw();
  raw.deal.properties.vigencia_en_dias = '';
  assert.equal(buildQuoteViewModel(raw).vigencia, '');
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `node --test src/modules/deals/quote-view-model.test.js`
Expected: FAIL. La `vigencia` actual sale de `formatDate(hs_expiration_date)` → `'martes, enero 27, 2026'`, no `'15 días'`.

- [ ] **Step 3: Implementar `vigencia` literal en el view model**

En `src/modules/deals/quote-view-model.js`:

1. Dentro de `buildQuoteViewModel`, después de la línea `const currencyCode = dp.deal_currency_code ?? '';`, agrega:

```js
  const vigenciaDias = String(dp.vigencia_en_dias ?? '').trim();
```

2. Reemplaza la línea actual del objeto retornado:

```js
    vigencia: escapeHtml(formatDate(qp.hs_expiration_date, timeZone)),
```

por:

```js
    vigencia: vigenciaDias ? escapeHtml(`${vigenciaDias} días`) : '',
```

(No quites el `import` de `formatDate`: sigue usándose para `fecha`.)

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `node --test src/modules/deals/quote-view-model.test.js`
Expected: PASS.

### Parte B — el repository pide la propiedad nueva y deja de pedir la vieja

- [ ] **Step 5: Ajustar las listas de propiedades del repository**

En `src/modules/deals/hubspot-quote.repository.js`:

1. En `DEAL_PROPERTIES`, agrega `'vigencia_en_dias',` (por ejemplo, después de `'garantia',`).

2. En `QUOTE_PROPERTIES`, **elimina** la línea `'hs_expiration_date',`. La lista queda:

```js
const QUOTE_PROPERTIES = [
  'hs_tcv',
  'hs_tax_total',
  'hs_quote_amount',
  'hs_last_published_date',
];
```

- [ ] **Step 6: Correr toda la suite para confirmar que nada se rompió**

Run: `node --test`
Expected: PASS (no hay test del repository; este paso valida que los cambios del view model y del resto siguen verdes).

- [ ] **Step 7: Commit**

```bash
git add src/modules/deals/quote-view-model.js src/modules/deals/quote-view-model.test.js src/modules/deals/hubspot-quote.repository.js
git commit -m "feat: vigencia del PDF desde vigencia_en_dias del deal con sufijo días"
```

---

## Task 4: Actualizar el handoff (mapeo de campos)

**Files:**
- Modify: `docs/ESTADO-Y-PENDIENTES.md`

- [ ] **Step 1: Actualizar la tabla de mapeo de campos (§5)**

En `docs/ESTADO-Y-PENDIENTES.md`, sección "## 5. Mapeo de campos (PDF ← HubSpot)":

1. Reemplaza la fila de Fecha/Vigencia:

```
| Fecha / Vigencia | Quote **principal** | `hs_last_published_date` / `hs_expiration_date` (en TZ del portal) |
```

por dos filas:

```
| Fecha | Quote **principal** | `hs_last_published_date` (en TZ del portal) |
| Vigencia | Deal | `vigencia_en_dias` (número) mostrado literal + " días" (ej. `15 días`) |
```

2. En la fila de Contacto/Teléfonos, agrega la nota de la nueva regla. Reemplaza:

```
| Contacto / Teléfonos | Contacto **principal** | `firstname`+`lastname`, `phone` |
```

por:

```
| Contacto / Teléfonos | Contacto **principal** (o el único si hay uno solo) | `firstname`+`lastname`, `phone` |
```

3. Agrega una fila para el URL del PDF al final de la tabla:

```
| TLD del URL del PDF | Sucursal | mapa `SUCURSAL_TLD` en `quote-view-model.js` (default `gt`) |
```

- [ ] **Step 2: Marcar los cambios como aplicados en §8**

En `docs/ESTADO-Y-PENDIENTES.md`, en la subsección "### En progreso — ajustes al PDF (spec aprobado 2026-06-04)", cambia el título a:

```
### Aplicado — ajustes al PDF (2026-06-04)
```

- [ ] **Step 3: Commit**

```bash
git add docs/ESTADO-Y-PENDIENTES.md
git commit -m "docs: actualizar mapeo de campos del PDF (vigencia, contacto único, TLD)"
```

---

## Task 5: Verificación final

- [ ] **Step 1: Correr toda la suite de tests**

Run: `node --test`
Expected: PASS, sin tests fallidos. (La suite crece respecto a los 27 previos por los nuevos casos de contacto, `siteTld` y `vigencia`.)

- [ ] **Step 2: Confirmar que no quedaron referencias a lo eliminado**

Run: `grep -rn "hs_expiration_date\|construtecho.com.gt\">" src/`
Expected: sin resultados (ya no se pide `hs_expiration_date` y el URL del header ya no está hardcodeado con `.gt`).

> **Nota de despliegue (no es un paso de código):** los tres cambios son **solo backend**; no tocan el card (`src/app/**`). Para aplicar en producción: `git pull` + `docker compose up -d --build` en el VPS. Prerrequisito en HubSpot: la propiedad de deal `vigencia_en_dias` (texto de una línea, validación regex numérica, valor por defecto) debe existir antes de probar.

---

## Self-Review (hecho)

- **Cobertura del spec:** Cambio 1 → Task 2; Cambio 2 → Task 3; Cambio 4 → Task 1; cleanup `hs_expiration_date` → Task 3 Step 5; docs → Task 4. Cambio 3 es no-op (sin tarea, intencional).
- **Sin placeholders:** todos los pasos traen código y comandos concretos.
- **Consistencia de tipos/nombres:** `siteTld` (view model → `{{siteTld}}` plantilla → `replaceAll`), `vigencia_en_dias` (repository `DEAL_PROPERTIES` → `dp.vigencia_en_dias` view model), `resolvePrincipalContactId` (misma firma). Coinciden en todas las tareas.
