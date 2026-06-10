import crypto from 'node:crypto';

/**
 * Construye la key (ruta dentro del bucket R2) del PDF de una cotización.
 *
 * Incluye el dealId (aísla cotizaciones de deals distintos) y DOS fuentes de unicidad:
 * el timestamp en ms y 8 hex aleatorios. La entropía evita que dos generaciones del
 * MISMO deal en la misma milésima de segundo produzcan la misma key y se sobreescriban
 * en R2 (PutObject es last-write-wins, sin condición de unicidad).
 */
export function buildPdfKey(dealId) {
  return `quotes/propuesta-${dealId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.pdf`;
}
