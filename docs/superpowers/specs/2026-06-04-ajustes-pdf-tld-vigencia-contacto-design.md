# Ajustes al PDF de cotización: TLD por sucursal, vigencia en días y contacto por defecto

> **Spec de diseño.** Fecha: 2026-06-04. Estado: aprobado, pendiente de implementar.
> Alcance acotado a la capa de view model + plantilla + asociaciones. **Sin llamadas
> nuevas a HubSpot** (de hecho se deja de pedir una propiedad). Riesgo de timeout: nulo.

---

## 1. Contexto

El flujo actual (`POST /deals/send-quote`) trae datos de un Deal de HubSpot, arma un
HTML y lo renderiza a PDF con Puppeteer. Ver `docs/ESTADO-Y-PENDIENTES.md` para el
panorama completo. Este spec cubre tres ajustes solicitados por el cliente
(Construtecho) sobre cómo se llenan tres campos del PDF y cómo se elige el contacto.

**Resumen de alcance:**

| # | Cambio | Capa afectada | Riesgo |
|---|--------|---------------|--------|
| 1 | TLD del URL del PDF según la sucursal | view model + plantilla | bajo |
| 2 | `vigencia` = valor literal de `vigencia_en_dias` + " días" | view model + repository | bajo |
| 3 | (descartado — no se toca) | — | — |
| 4 | Contacto por defecto cuando hay uno solo | asociaciones (función pura) | bajo |

Los tres cambios reutilizan datos que **ya se traen** del deal y de los line items.
No se agregan llamadas HTTP. El Cambio 2 incluso **elimina** una propiedad de la
consulta de la cotización (`hs_expiration_date`).

---

## 2. Cambio 1 — TLD del URL según la sucursal

### Comportamiento
El PDF muestra el URL `www.construtecho.com.gt` (hardcodeado). Debe cambiar el TLD
de país según la **sucursal** que aparece en el PDF (que hoy es la última palabra del
label del pipeline, vía `lastWord(pipelineLabel)`):

- Guatemala → `gt`
- Honduras → `hn`
- (sin coincidencia) → `gt` por defecto (mantiene lo actual)

### Diseño
- **Mapa único** en `quote-view-model.js`, como constante de nivel de módulo:

  ```js
  const SUCURSAL_TLD = {
    guatemala: 'gt',
    honduras: 'hn',
  };
  const DEFAULT_TLD = 'gt';
  ```

  Agregar una sede futura = **una línea** en este mapa. Es el único lugar a tocar.

- **Normalización de la llave:** la sucursal se normaliza a minúsculas y sin acentos
  antes de buscar en el mapa, de modo que "Honduras", "honduras" o "HONDURAS" caen
  igual. Para sedes de una palabra (caso actual) es exacto. (Nota: para una sede
  futura de dos palabras tipo "Costa Rica", la llave sería la última palabra, `rica`,
  por la lógica `lastWord` ya existente; queda documentado aquí.)

- **View model:** se agrega el campo `siteTld` calculado a partir de la sucursal ya
  resuelta. El valor es solo el TLD de 2 letras (`gt`, `hn`), no el URL completo.

- **Plantilla** (`designs/proposal.html`): el ancla pasa de URL fija a TLD templatizado;
  el dominio queda literal y solo se inyecta el TLD:

  ```html
  <a href="https://construtecho.com.{{siteTld}}">www.construtecho.com.{{siteTld}}</a>
  ```

- **proposal-template.js:** un `replaceAll('{{siteTld}}', viewModel.siteTld)` adicional.

### Casos borde
- Sucursal vacía o no mapeada → `gt`.
- El TLD es de un conjunto controlado (valores del mapa), por lo que no requiere escape
  adicional, pero se trata como los demás valores del view model por consistencia.

---

## 3. Cambio 2 — `vigencia` = valor literal + " días"

### Comportamiento
Hoy `vigencia` se calcula desde `hs_expiration_date` de la cotización. Cambia a:
tomar la propiedad **del deal** `vigencia_en_dias` (un número, validado en HubSpot por
regex del lado del CRM) y mostrarla literal en el campo "vigencia" del PDF, agregando
la palabra `" días"` (siempre en plural).

- `vigencia_en_dias = 15` → PDF muestra `15 días`.
- `vigencia_en_dias` vacío → PDF muestra vacío (sin la palabra "días" colgando).

### Diseño
- **repository (`hubspot-quote.repository.js`):**
  - Agregar `vigencia_en_dias` a `DEAL_PROPERTIES`.
  - **Quitar `hs_expiration_date`** de `QUOTE_PROPERTIES` (queda sin uso tras el cambio).
- **view model (`quote-view-model.js`):**
  - `vigencia` = se toma `dp.vigencia_en_dias`, se hace `trim`; si queda con contenido →
    `escapeHtml(`${valor} días`)`; si queda vacío → cadena vacía.
  - Deja de invocar `formatDate(qp.hs_expiration_date, timeZone)`. `formatDate` se
    mantiene para `fecha` (que sigue saliendo de `hs_last_published_date`).

### Notas
- La validación numérica vive en HubSpot (regex sobre la propiedad). El backend no
  recalcula ni valida formato; solo toma el valor literal y le concatena " días".
  El `trim` + chequeo de vacío evita mostrar `" días"` suelto si el campo viniera vacío.
- No hay aritmética de fechas ni dependencia de zona horaria en este campo (a diferencia
  de la propuesta inicial descartada), por lo que no hay riesgo de cálculo/DST.

---

## 4. Cambio 3 — (descartado)

`numero_de_registro` se deja **exactamente como está**: propiedad de texto del deal,
llenada a mano, que viaja al PDF en el campo `# registro`. No se toca código ni la
propiedad. Se documenta aquí solo para dejar constancia de que se evaluó y se descartó.

---

## 5. Cambio 4 — contacto por defecto cuando hay uno solo

### Comportamiento
Hoy se elige el contacto con etiqueta de asociación `principal`; si ninguno la tiene,
queda vacío. El cliente pide que, si el deal tiene **un solo contacto**, se use ese
aunque no tenga etiqueta `principal`. Cuando hay varios, se mantiene la desambiguación
por `principal`, y si hay ambigüedad (ninguno o más de uno con `principal`) → vacío.

### Tabla de decisión

| Situación (contactos distintos por id) | Resultado |
|---|---|
| 0 contactos | vacío (`null`) |
| 1 contacto (con o sin etiqueta) | ese contacto |
| 2+ contactos, exactamente 1 con `principal` | el que tiene `principal` |
| 2+ contactos, ninguno con `principal` | vacío |
| 2+ contactos, 2 o más con `principal` | vacío |

### Diseño
Se reescribe la función pura `resolvePrincipalContactId(associations)` en
`hubspot-associations.js`. El conteo se hace por **id único**, no por número de filas:
en HubSpot un mismo contacto no se asocia dos veces, pero **sí puede traer dos
etiquetas**, y la API lo devuelve como dos filas con el mismo id; deduplicar por id
hace que ese caso se cuente como un solo contacto.

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

`resolvePrimaryQuoteId` y `getAssociationIds` no cambian.

---

## 6. Impacto, rendimiento y compatibilidad

- **Sin llamadas nuevas a HubSpot.** `vigencia_en_dias` viaja en la consulta del deal
  que ya se hace; el contacto se sigue resolviendo de las asociaciones ya traídas.
- **Una propiedad menos:** se deja de pedir `hs_expiration_date`.
- **Riesgo de timeout: nulo.** El tiempo de Puppeteer no cambia.
- **Solo backend.** Ninguno de los tres cambios toca el card (`src/app/**`); el
  despliegue es `git pull` + `docker compose up -d --build` en el VPS, sin
  `hs project upload`.

### Prerrequisitos en HubSpot (los hace el cliente / administrador del portal)
- **Cambio 2:** la propiedad de deal `vigencia_en_dias` debe existir (texto de una
  línea con validación regex numérica y valor por defecto) antes de probar en prod.
- **Cambio 1 y 4:** no requieren cambios en HubSpot.

---

## 7. Pruebas

Se actualizan/agregan tests de `node:test` sobre las funciones puras (sin red):

- **`hubspot-associations.test.js`** — cubrir la tabla de decisión del Cambio 4:
  0 contactos, 1 contacto sin etiqueta, 1 contacto con dos etiquetas (dos filas, mismo
  id) → ese contacto, 2 contactos con 1 principal, 2 sin principal, 2 con principal.
- **`quote-view-model.test.js`** — `siteTld` (Guatemala→gt, Honduras→hn, vacío/no
  mapeado→gt, insensible a mayúsculas/acentos) y `vigencia` (valor→"N días", vacío→"").
- **`proposal-template.test.js`** — que `{{siteTld}}` se reemplace en ambas posiciones
  del ancla.

---

## 8. Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/modules/deals/designs/proposal.html` | URL → `construtecho.com.{{siteTld}}` |
| `src/modules/deals/quote-view-model.js` | mapa `SUCURSAL_TLD`, campo `siteTld`, `vigencia` literal |
| `src/modules/deals/proposal-template.js` | `replaceAll('{{siteTld}}', …)` |
| `src/modules/deals/hubspot-quote.repository.js` | +`vigencia_en_dias`, −`hs_expiration_date` |
| `src/modules/deals/hubspot-associations.js` | nueva lógica de `resolvePrincipalContactId` |
| Tests correspondientes | nuevos casos |
| `docs/ESTADO-Y-PENDIENTES.md` | actualizar mapeo de campos y regla de contacto |
