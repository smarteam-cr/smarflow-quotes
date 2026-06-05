# Cambio 6 — Sincronizar `sistema` del negocio desde los line items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **ESTADO: PROPUESTA.** No ejecutar hasta confirmación explícita ("ejecutemos"). Vive en
> la rama `plan/cambio-6-sistema-sync`. Si se descarta → borrar la rama; `main` intacto.

**Goal:** Al generar la cotización, recalcular y **reemplazar** la propiedad `sistema`
del negocio con el conjunto de valores `sistema` de sus line items; de forma **bloqueante**
(si la escritura falla, no se genera el PDF y se alerta).

**Architecture:** Una función pura calcula el valor (`;`-separado, valores internos, sin
`;` inicial). El repository añade `sistema` a las propiedades de line items y un método de
escritura que lanza error. El service escribe ese valor **antes** del PDF; si falla, aborta.
El card muestra el mensaje específico del backend. El URL sigue best-effort, después del PDF.

**Tech Stack:** Node.js (ESM), `node:test` + `node:assert/strict`, Fastify, Puppeteer (sin tocar), `@hubspot/api-client`, React UI-extension (card).

**Spec:** `docs/superpowers/specs/2026-06-04-cambio-6-sistema-sync-design.md`

**Comando de pruebas:** `node --test` (todo) o `node --test <archivo>` (uno).

**Formato HubSpot (verificado):** checkbox múltiple = valores internos unidos por `;` sin
espacios; **`;` inicial = append** (a evitar); `""` limpia. Escribimos sin `;` inicial → reemplaza.

---

## File Structure

| Archivo | Responsabilidad | Cambio |
|---------|-----------------|--------|
| `src/modules/deals/deal-sistema.js` | Pura: line items → valor `sistema` | **Nuevo** |
| `src/modules/deals/deal-sistema.test.js` | Tests de la pura | **Nuevo** |
| `src/modules/deals/hubspot-quote.repository.js` | I/O HubSpot | +`sistema` en line items; `updateDealSistema` |
| `src/modules/deals/deal.service.js` | Orquestación | Escritura bloqueante antes del PDF |
| `src/app/cards/send-quote-app-card.tsx` | Card | Mensaje específico del backend |
| `docs/ESTADO-Y-PENDIENTES.md` | Handoff | Flujo, decisión, estado |

---

## Task 1: Función pura `computeSistemaValue`

**Files:**
- Create: `src/modules/deals/deal-sistema.js`
- Test: `src/modules/deals/deal-sistema.test.js`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/modules/deals/deal-sistema.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSistemaValue } from './deal-sistema.js';

const li = (sistema) => ({ properties: { sistema } });

test('lista vacía o indefinida → cadena vacía', () => {
  assert.equal(computeSistemaValue([]), '');
  assert.equal(computeSistemaValue(undefined), '');
});

test('line items sin sistema → cadena vacía', () => {
  assert.equal(computeSistemaValue([{ properties: {} }, li('')]), '');
});

test('deduplica preservando orden y une con ; sin espacios', () => {
  assert.equal(
    computeSistemaValue([li('caso1'), li('caso1'), li('caso3')]),
    'caso1;caso3',
  );
});

test('recalcula con otro conjunto de line items', () => {
  assert.equal(computeSistemaValue([li('caso2'), li('caso3')]), 'caso2;caso3');
});

test('ignora vacíos/espacios y nunca produce ; inicial', () => {
  const out = computeSistemaValue([li('caso1'), li('   '), li(''), li('caso2'), li('caso1')]);
  assert.equal(out, 'caso1;caso2');
  assert.ok(!out.startsWith(';'), 'un ; inicial haría append en HubSpot, no reemplazo');
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test src/modules/deals/deal-sistema.test.js`
Expected: FAIL (no existe `deal-sistema.js` / `computeSistemaValue`).

- [ ] **Step 3: Implementar la función pura**

Crear `src/modules/deals/deal-sistema.js`:

```js
/**
 * Calcula el valor de la propiedad multi-checkbox `sistema` del negocio a partir
 * de los line items. Toma el `sistema` (desplegable, 1 valor por line item) de cada
 * uno, descarta vacíos, deduplica preservando orden de aparición y los une con ';'
 * (formato interno de selección múltiple de HubSpot; SIN ';' inicial → reemplaza).
 * Devuelve '' si no hay valores (al escribirse, limpia el campo del negocio).
 */
export function computeSistemaValue(lineItems) {
  const seen = new Set();
  const values = [];
  for (const lineItem of lineItems ?? []) {
    const raw = String(lineItem?.properties?.sistema ?? '').trim();
    if (raw === '' || seen.has(raw)) continue;
    seen.add(raw);
    values.push(raw);
  }
  return values.join(';');
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test src/modules/deals/deal-sistema.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/deals/deal-sistema.js src/modules/deals/deal-sistema.test.js
git commit -m "feat: función pura para calcular el sistema del negocio desde line items"
```

---

## Task 2: Repository — leer `sistema` de line items y método de escritura

**Files:**
- Modify: `src/modules/deals/hubspot-quote.repository.js`

> Sin test unitario (es I/O, como el resto del repository). Se valida en la prueba manual
> end-to-end de la Task 6.

- [ ] **Step 1: Agregar `sistema` a `LINE_ITEM_PROPERTIES`**

En `src/modules/deals/hubspot-quote.repository.js`, agregar `'sistema',` al final de la
lista `LINE_ITEM_PROPERTIES`:

```js
const LINE_ITEM_PROPERTIES = [
  'quantity',
  'name',
  'datos_tecnicos',
  'description',
  'price',
  'amount',
  'despiece',
  'sistema',
];
```

- [ ] **Step 2: Agregar el método `updateDealSistema` (lanza error)**

En el mismo archivo, agregar esta función dentro de `createHubspotQuoteRepository`
(junto a `saveQuoteUrl`). **Importante:** NO la envuelvas en try/catch — debe propagar el
error para que el service pueda abortar.

```js
async function updateDealSistema(dealId, value) {
  await hubspotClient.crm.deals.basicApi.update(dealId, {
    properties: { sistema: value },
  });
}
```

Y exportarla en el objeto de retorno del repository (junto a `saveQuoteUrl`, etc.):

```js
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
    updateDealSistema,
  };
```

`saveQuoteUrl` no se toca (sigue best-effort).

- [ ] **Step 3: Confirmar que la suite sigue verde**

Run: `node --test`
Expected: PASS (sin cambios de comportamiento aún en lógica probada).

- [ ] **Step 4: Commit**

```bash
git add src/modules/deals/hubspot-quote.repository.js
git commit -m "feat: leer sistema de line items y método updateDealSistema (lanza error)"
```

---

## Task 3: Service — escritura bloqueante de `sistema` antes del PDF

**Files:**
- Modify: `src/modules/deals/deal.service.js`

> Sin test unitario (orquestación I/O). Se valida en la Task 6.

- [ ] **Step 1: Importar la función pura**

En `src/modules/deals/deal.service.js`, agregar el import (junto a los otros imports de
`./...`). `serverError` ya está importado de `../../utils/errors.js`.

```js
import { computeSistemaValue } from './deal-sistema.js';
```

- [ ] **Step 2: Insertar la escritura bloqueante ANTES del PDF**

En la función `sendQuote`, justo **después** del bloque
`const [quote, contact, company, lineItems, owner, pipelineLabel, timeZone] = await Promise.all([...]);`
y **antes** de `const viewModel = buildQuoteViewModel({...});`, insertar:

```js
    // Recalcular y reemplazar `sistema` del negocio según los line items actuales.
    // Bloqueante a propósito: si falla, NO se genera el PDF (integridad del dato).
    const sistemaValue = computeSistemaValue(lineItems);
    try {
      await repo.updateDealSistema(dealId, sistemaValue);
    } catch (err) {
      logger.error(
        { dealId, err: err.message },
        'No se pudo actualizar sistema del negocio',
      );
      throw serverError(
        'No se pudo actualizar la propiedad "sistema" del negocio en HubSpot; no se generó la cotización. ' +
          'Verifica que las opciones de "sistema" del negocio incluyan las de los productos e inténtalo de nuevo.',
      );
    }
```

El resto del flujo (`buildQuoteViewModel` → `buildProposalHtml` → `createProposalPdf` →
`saveQuoteUrl`) queda igual, después de esta escritura.

- [ ] **Step 3: Confirmar que la suite sigue verde**

Run: `node --test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/deals/deal.service.js
git commit -m "feat: escribir sistema del negocio (bloqueante) antes de generar el PDF"
```

---

## Task 4: Card — mostrar el mensaje específico del backend

> **DECISIÓN DEL EQUIPO:** esta tarea toca el frontend → requiere `hs project upload`
> (despliegue separado del backend). Si el equipo prefiere el mensaje genérico actual,
> **omitir esta tarea** (el card ya muestra "No se pudo generar la cotización. Intenta de
> nuevo." ante cualquier error, y el PDF igual no se genera).

**Files:**
- Modify: `src/app/cards/send-quote-app-card.tsx`

- [ ] **Step 1: Extraer el mensaje del backend cuando la respuesta no es ok**

Reemplazar el bloque:

```js
      if (!response.ok) {
        throw new Error(`Fastify API responded with ${response.status}`);
      }
```

por:

```js
      if (!response.ok) {
        let serverMessage = '';
        try {
          const errBody = await response.json();
          serverMessage = typeof errBody?.message === 'string' ? errBody.message : '';
        } catch {
          serverMessage = '';
        }
        throw new Error(serverMessage || `Fastify API responded with ${response.status}`);
      }
```

- [ ] **Step 2: Mostrar el mensaje específico en el `catch`**

Reemplazar el bloque:

```js
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(message);
      setErrorMsg(
        /timeout|timed out/i.test(message)
          ? 'La generación tardó demasiado. Vuelve a intentarlo.'
          : 'No se pudo generar la cotización. Intenta de nuevo.',
      );
    }
```

por:

```js
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(message);
      if (/timeout|timed out/i.test(message)) {
        setErrorMsg('La generación tardó demasiado. Vuelve a intentarlo.');
      } else if (
        /Fastify API responded with|Failed to fetch|NetworkError|Load failed/i.test(message)
      ) {
        setErrorMsg('No se pudo generar la cotización. Intenta de nuevo.');
      } else {
        // Mensaje específico del backend (p. ej. falla al actualizar "sistema").
        setErrorMsg(message);
      }
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/cards/send-quote-app-card.tsx
git commit -m "feat: el card muestra el mensaje específico de error del backend"
```

---

## Task 5: Actualizar el handoff

**Files:**
- Modify: `docs/ESTADO-Y-PENDIENTES.md`

- [ ] **Step 1: Flujo (§2) — reflejar las dos escrituras**

En "**Flujo interno (`POST /deals/send-quote`):**", reemplazar la lista numerada por:

```
1. `getDeal` (endpoint `2026-03` vía `apiRequest`, trae propiedades + asociaciones con labels).
2. Resolver quote principal (`deal_to_primary_quote`) y contacto (el único si hay uno solo; si hay varios, el `principal`).
3. En paralelo: quote, contacto, empresa, line items, owner, pipeline label, timezone del portal.
4. **Escribir `sistema` del negocio** (recalculado desde los line items) — **bloqueante**: si falla, no se genera el PDF.
5. `buildQuoteViewModel` (función pura) → view model limpio y formateado.
6. `buildProposalHtml` rellena `designs/proposal.html`.
7. Puppeteer (`networkidle0`) → PDF → R2 (`uploadPdf`).
8. Guardar URL en `url_de_la_ultima_cotizacion` (best-effort, no bloquea).
```

- [ ] **Step 2: Decisiones (§6) — agregar el porqué**

Agregar al final de la sección "## 6. Decisiones y el porqué":

```
- **`sistema` del negocio se sincroniza desde los line items, bloqueante.** Al generar la
  cotización se recalcula y **reemplaza** `sistema` del deal con los valores `sistema` de
  los line items (checkbox múltiple, valores internos unidos por `;` sin `;` inicial). Se
  escribe **antes** del PDF; si falla, no se genera el PDF y se alerta. *Por qué:* alimenta
  métricas del negocio; un fallo silencioso las descuadraría. Precondición: las opciones de
  `sistema` del negocio deben incluir las de productos.
```

- [ ] **Step 3: Estado (§8) — registrar el cambio**

Agregar una subsección al inicio del backlog "## 8. Pendientes / Backlog (por hacer)"
(después del encabezado), o bajo "### Aplicado — ajustes al PDF" según corresponda al
momento de ejecutar:

```
### Aplicado — sincronización de `sistema` (Cambio 6)
Spec/plan: `docs/superpowers/{specs,plans}/2026-06-04-cambio-6-sistema-sync*`.
Al "Crear cotización" se reemplaza `sistema` del negocio desde los line items, **bloqueante**
(si falla la escritura, no hay PDF). Toca backend y card (`hs project upload`). Precondición:
opciones de `sistema` del negocio ⊇ las de productos. Scope `crm.objects.deals.write` ya estaba.
```

- [ ] **Step 4: Commit**

```bash
git add docs/ESTADO-Y-PENDIENTES.md
git commit -m "docs: sincronización de sistema del negocio en el flujo de cotización"
```

---

## Task 6: Verificación

- [ ] **Step 1: Suite completa**

Run: `node --test`
Expected: PASS (incluye los nuevos tests de `computeSistemaValue`).

- [ ] **Step 2: Auditar precondición de opciones (manual, en HubSpot)**

Confirmar que las opciones internas de `sistema` del **negocio** incluyen TODAS las de
`sistema` de **productos**. (Si falta alguna, los deals con esa opción no generarán PDF.)

- [ ] **Step 3: Prueba end-to-end en un deal de prueba (tras desplegar)**

Backend: `git pull` + `docker compose up -d --build`. Card (si se hizo Task 4): `hs project upload`.
1. Deal con line items `caso1`, `caso1`, `caso3` → "Crear cotización" → el `sistema` del
   negocio queda `caso1;caso3` y el PDF se genera.
2. Cambiar line items a `caso2`, `caso3` → regenerar → `sistema` queda `caso2;caso3` (reemplazo).
3. Deal sin line items (o sin `sistema`) → regenerar → `sistema` del negocio queda vacío.
4. Forzar un line item con un valor que NO exista en las opciones del negocio → regenerar
   → **no se genera el PDF** y aparece la alerta con el mensaje específico.

> **Despliegue:** backend siempre (`git pull` + rebuild). Card solo si se ejecutó la Task 4
> (`hs project upload`).

---

## Self-Review (hecho)

- **Cobertura del spec:** función pura → Task 1; lectura `sistema` + escritura → Task 2;
  orden bloqueante antes del PDF → Task 3; mensaje específico → Task 4 (opcional); docs → Task 5;
  verificación + precondición + E2E → Task 6.
- **Sin placeholders:** todos los pasos traen código/edición y comandos concretos.
- **Consistencia de nombres:** `computeSistemaValue` (Task 1 → import en Task 3),
  `updateDealSistema` (Task 2 → uso en Task 3), `sistema` en `LINE_ITEM_PROPERTIES` (Task 2).
- **Reemplazo, no append:** `join(';')` nunca produce `;` inicial (test lo verifica).
