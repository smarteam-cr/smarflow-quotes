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
