# Cambio 6 — Sincronizar `sistema` del negocio desde los line items

> **Spec de diseño.** Fecha: 2026-06-04. Estado: **PROPUESTA, pendiente de decisión del equipo.**
> Este documento (y su plan) viven en la rama `plan/cambio-6-sistema-sync`. No se ha
> tocado código. Si el equipo aprueba → se ejecuta el plan; si no → se borra la rama y
> `main` queda intacto.

---

## 1. Contexto

El negocio (deal) tiene una propiedad `sistema` de tipo **selección múltiple (checkbox
múltiple)**. Los productos (line items) tienen una propiedad `sistema` que **también es
de tipo selección múltiple (checkbox)** — es decir, un line item puede traer **varios
valores** a la vez. Los **valores internos** de las opciones coinciden en ambas
(`caso1`, `caso2`, `caso3`, …).

Se requiere que, al **generar la cotización** ("Crear cotización"), el `sistema` del
negocio se **recalcule y reemplace** con el conjunto de valores `sistema` que traen los
line items asociados en ese momento.

Ejemplo:
- Line items con `caso1`, `caso1`, `caso3` → negocio `sistema = caso1;caso3`.
- Si luego cambian a `caso2`, `caso3` → negocio `sistema = caso2;caso3`.
- Como cada line item puede traer varios: Line item A `caso1;caso2` + Line item B
  `caso2;caso3` → negocio `sistema = caso1;caso2;caso3` (unión deduplicada).

No es "agregar": es **recalcular y reemplazar** el valor completo según los line items
actuales.

---

## 2. Alcance y disparador

- **Disparador:** el endpoint existente `POST /deals/send-quote` (botón "Crear
  cotización"). El `sistema` del negocio se sincroniza **solo al generar la cotización**,
  no en tiempo real cuando cambian los line items. *(Si en el futuro se quisiera tiempo
  real, sería otro mecanismo: workflow de HubSpot o webhook de line items — fuera de
  alcance.)*
- **Primer cambio que escribe datos de negocio** más allá del URL. Por eso es
  **bloqueante** (ver §4): si la escritura falla, **no se genera el PDF** y se muestra
  alerta — para no descuadrar las métricas del negocio en silencio.

---

## 3. Diseño

### 3.1 Orden del flujo (`sendQuote`)

Las **dos escrituras al deal ocurren en momentos distintos**:

1. Traer deal + asociaciones + line items + demás datos (como hoy).
2. **Calcular** el valor de `sistema` desde los line items (función pura).
3. **Escribir `sistema` en el deal (BLOQUEANTE).** Si falla → lanzar error → **no hay
   PDF**. Va **antes** del PDF para fallar rápido y no dejar PDF huérfano en R2.
4. Generar el PDF → subir a R2.
5. **Escribir el URL** (`url_de_la_ultima_cotizacion`) → **después** del PDF (el URL no
   existe hasta aquí). Se queda **best-effort** como hoy.
6. Devolver el resultado.

Responsabilidades:
- **`sistema`** → antes del PDF, **bloqueante** (integridad del dato).
- **URL** → después del PDF, **best-effort** (conveniencia; se devuelve igual en la respuesta).

> Nota de honestidad respecto a la charla inicial: al ser bloqueante y antes del PDF,
> `sistema` **no** puede piggyback en la escritura del URL → son **dos PATCH** al deal
> (+1 escritura vs hoy). Latencia añadida: insignificante (~1 request, como la del URL).
> Sin riesgo de timeout.

### 3.2 Formato del valor (verificado contra HubSpot)

Las propiedades de **checkbox múltiple** de HubSpot se escriben como **valores internos
separados por `;` sin espacios**: `"caso1;caso3"`.

- Escribir `"caso1;caso3"` (sin `;` inicial) → **reemplaza** el valor. ✅ Es lo que queremos.
- ⚠️ **Gotcha:** un `;` **al inicio** (`";caso1;caso3"`) hace **append** sobre el valor
  existente. **NO** debemos generar ese formato. `join(';')` no produce `;` inicial → correcto.
- Escribir `""` → **limpia** el campo.
- Se usan **valores internos**, no etiquetas (igual que `despiece`).

### 3.3 Función pura `computeSistemaValue(lineItems)`

Nuevo módulo puro `src/modules/deals/deal-sistema.js`. Como el `sistema` del line item
**también es checkbox múltiple**, su valor ya viene como cadena `;`-separada (`"caso1;caso2"`),
así que hay que **separar por `;` el valor de cada line item** antes de juntar:

```js
/**
 * Calcula el valor de la propiedad multi-checkbox `sistema` del negocio a partir de los
 * line items. Ambas propiedades (`sistema` de negocio y de productos) son de selección
 * múltiple, así que el `sistema` de CADA line item ya puede traer varios valores internos
 * separados por ';'. Se separan, se descartan vacíos, se deduplican preservando orden de
 * aparición y se unen con ';' (formato interno de HubSpot; SIN ';' inicial → reemplaza).
 * Devuelve '' si no hay valores (al escribirse, limpia el campo del negocio).
 */
export function computeSistemaValue(lineItems) {
  const seen = new Set();
  const values = [];
  for (const lineItem of lineItems ?? []) {
    const raw = String(lineItem?.properties?.sistema ?? '');
    for (const token of raw.split(';')) {
      const value = token.trim();
      if (value === '' || seen.has(value)) continue;
      seen.add(value);
      values.push(value);
    }
  }
  return values.join(';');
}
```

### 3.4 Repository (`hubspot-quote.repository.js`)

- Agregar `'sistema'` a `LINE_ITEM_PROPERTIES` (ya se traen los line items → cero llamadas de lectura nuevas).
- Nuevo método **que SÍ lanza error** (a diferencia de `saveQuoteUrl`, que es best-effort):

```js
async function updateDealSistema(dealId, value) {
  await hubspotClient.crm.deals.basicApi.update(dealId, {
    properties: { sistema: value },
  });
}
```

`saveQuoteUrl` no cambia (sigue best-effort, después del PDF).

### 3.5 Service (`deal.service.js`)

Después del `Promise.all` que ya resuelve `lineItems`, y **antes** de construir el
view model / PDF:

```js
const sistemaValue = computeSistemaValue(lineItems);
try {
  await repo.updateDealSistema(dealId, sistemaValue);
} catch (err) {
  logger.error({ dealId, err: err.message }, 'No se pudo actualizar sistema del negocio');
  throw serverError(
    'No se pudo actualizar la propiedad "sistema" del negocio en HubSpot; no se generó la cotización. ' +
      'Verifica que las opciones de "sistema" del negocio incluyan las de los productos e inténtalo de nuevo.',
  );
}
```

El resto (`buildQuoteViewModel` → `buildProposalHtml` → `createProposalPdf` →
`saveQuoteUrl`) queda igual, después de esta escritura.

### 3.6 Card (`send-quote-app-card.tsx`)

Para que el operador vea un mensaje **específico** (no genérico), el card surface el
mensaje del backend en errores de aplicación, manteniendo mensajes propios para
timeout / fallos de transporte. **Esto toca el frontend → requiere `hs project upload`.**

---

## 4. Manejo de errores (bloqueante)

- `updateDealSistema` lanza ante cualquier fallo de HubSpot.
- El service lo convierte en `serverError(...)` (HTTP 500) con mensaje claro.
- El error handler de Fastify ([app.js](../../../src/app.js)) responde `{ message }`.
- El card muestra ese `message` → alerta roja, **sin PDF**.
- Reintentar es seguro: la operación es **idempotente** (recalcula y reemplaza).

---

## 5. Casos borde

| Caso | Comportamiento |
|------|----------------|
| Sin line items / ninguno con `sistema` | `computeSistemaValue` → `''` → se escribe `''` → **limpia** el `sistema` del negocio (decisión propuesta, ver §6). La escritura de `''` debe tener éxito. |
| Line item con varios valores (`caso1;caso2`) | Se separa por `;` y cada valor entra al conjunto. |
| Line item con `sistema` vacío | Se ignora (no aporta). |
| `;` sobrantes o espacios (`;caso1;;caso2; `) | Se toleran: se separa, se hace `trim` y se descartan vacíos. |
| Valores repetidos (en el mismo line item o entre varios) | Se deduplican, preservando orden de aparición. |
| Valor de line item que **no existe** en las opciones del `sistema` del negocio | HubSpot rechaza el PATCH (400) → por ser **bloqueante**, **no se genera el PDF** y se muestra el error. Es el fallo "ruidoso" deseado: señala desalineación de opciones. |

---

## 6. Decisiones y el porqué (PROPUESTAS — el equipo confirma/cambia)

- **Bloqueante + antes del PDF.** Si la escritura de `sistema` falla, no se genera el PDF
  y se alerta. *Por qué:* el dato alimenta métricas del negocio; un fallo silencioso
  descuadraría la realidad sin que nadie se entere. El costo de bloquear (reintentar un
  botón manual) es bajo; el de un fallo silencioso, alto.
- **URL sigue best-effort, después del PDF.** Es un link de conveniencia y se devuelve en
  la respuesta aunque no se guarde en el deal.
- **Reemplazar (no append).** Se escribe sin `;` inicial. *Por qué:* el negocio debe
  reflejar exactamente los line items actuales.
- **Limpiar si no hay valores.** Sin line items con `sistema` → `sistema` del negocio
  vacío. *Por qué:* "reflejar la realidad actual". *(Si el equipo prefiere "no tocar si
  queda vacío", es un cambio menor: saltarse la escritura cuando el valor calculado es
  `''`.)*
- **Mensaje específico en el card.** *Por qué:* el operador debe entender que falló la
  actualización del negocio (no solo "reintenta"). *(Alternativa sin tocar el card:
  mostrar el mensaje genérico actual "No se pudo generar la cotización. Intenta de
  nuevo." — evita el `hs project upload`, pero es menos informativo.)*

---

## 7. Precondiciones (a cumplir ANTES de desplegar)

1. **Opciones alineadas:** la lista de opciones internas del `sistema` del **negocio**
   debe ser **igual o superconjunto** de la del `sistema` de **productos**. Si algún
   line item tiene un valor que no existe en el negocio, esa cotización **dejará de
   generarse** (por ser bloqueante) hasta corregir las opciones. **Auditar antes.**
2. **Propiedad del negocio** `sistema` existe y es **checkbox múltiple**.
3. **Scope `crm.objects.deals.write`** — ya lo tenemos (se usa para el URL). Sin cambios.
4. **Lectura de line items** — ya la tenemos.

---

## 8. Riesgos e impacto

- **Escribe en el CRM (mutación del deal).** Sobrescribe `sistema`; cualquier edición
  manual de ese campo se reemplaza en cada generación (intencional).
- **Acopla generación de PDF a la correctitud del dato.** Una desalineación de opciones
  detiene la generación para ese deal hasta arreglarla (deseable, pero hay que auditar
  opciones antes — ver §7).
- **+1 escritura** al deal respecto a hoy; latencia ~0; **sin riesgo de timeout**.
- **Sin scopes nuevos**, sin llamadas de lectura nuevas.
- **Despliegue:** backend (`git pull` + rebuild) **y card** (`hs project upload`) si se
  toma la opción de mensaje específico.

---

## 9. Pruebas

- **Unitarias (función pura `computeSistemaValue`):** lista vacía → `''`; sin `sistema`
  → `''`; `[caso1, caso1, caso3]` → `'caso1;caso3'`; `[caso2, caso3]` → `'caso2;caso3'`;
  **line item con varios valores** (`[caso1;caso2, caso2;caso3]` → `'caso1;caso2;caso3'`);
  `;` sobrantes/espacios tolerados; dedup preserva orden; **nunca** genera `;` inicial.
- **Integración manual (escritura/orden):** el repository y el service se validan
  manualmente (como el resto de I/O del proyecto). Verificación end-to-end en un deal de
  prueba: (a) genera cotización → el `sistema` del negocio refleja los line items; (b)
  cambia line items → regenera → se reemplaza; (c) fuerza un valor no existente en las
  opciones del negocio → no se genera PDF y aparece la alerta.

---

## 10. Archivos afectados (cuando se ejecute)

| Archivo | Cambio |
|---------|--------|
| `src/modules/deals/deal-sistema.js` | **Nuevo** — función pura `computeSistemaValue` |
| `src/modules/deals/deal-sistema.test.js` | **Nuevo** — tests de la función pura |
| `src/modules/deals/hubspot-quote.repository.js` | +`sistema` en `LINE_ITEM_PROPERTIES`; nuevo `updateDealSistema` (lanza error) |
| `src/modules/deals/deal.service.js` | Escritura bloqueante de `sistema` antes del PDF |
| `src/app/cards/send-quote-app-card.tsx` | Mostrar mensaje específico del backend *(opción recomendada; toca frontend)* |
| `docs/ESTADO-Y-PENDIENTES.md` | §2 (flujo: 2 escrituras), §6 (decisión), §8 (aplicado), scopes/precondiciones |

---

## 11. Fuera de alcance

- Sincronización en tiempo real al cambiar line items (sería workflow/webhook).
- Validar las opciones del `sistema` del negocio desde el backend (se confía en la
  precondición §7; HubSpot ya rechaza valores inválidos y el flujo bloqueante lo expone).
