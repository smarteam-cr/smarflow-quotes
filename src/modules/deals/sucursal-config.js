/**
 * Configuración por sucursal — ÚNICA fuente de verdad para los valores que dependen de
 * la sede: el nombre mostrado en el PDF, el TLD del URL y el % de IVA (etiqueta).
 *
 * Para AGREGAR una sucursal o CAMBIAR un dato (nombre, TLD, % de IVA), edita SOLO este
 * archivo: agrega/edita un objeto en `SUCURSALES` con todo lo que necesita esa sede.
 *
 * El match se hace porque el label del pipeline TERMINA con `match` (normalizado: sin
 * acentos, en minúsculas, con límite de palabra). Así una sede de dos palabras se maneja
 * sin problema: "Ventas Costa Rica" → termina con "costa rica" (sin el bug de traer solo
 * "rica"). Si varios `match` coinciden, gana el más largo (más específico).
 *
 * OJO: `ivaPct` es solo la ETIQUETA del porcentaje en el PDF; el MONTO del IVA lo calcula
 * HubSpot (`hs_tax_total`). Hay que mantener ambos coherentes por sede.
 */
export const SUCURSALES = [
  { match: 'guatemala', nombre: 'Guatemala', tld: 'gt', ivaPct: '12' },
  { match: 'honduras', nombre: 'Honduras', tld: 'hn', ivaPct: '15' },
  // Ejemplo de sede futura de dos palabras (sin bug de "rica"):
  // { match: 'costa rica', nombre: 'Costa Rica', tld: 'cr', ivaPct: '13' },
];

export const DEFAULT_SUCURSAL = { tld: 'gt', ivaPct: '12' };

function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function lastWord(value) {
  const cleaned = String(value ?? '').trim();
  if (!cleaned) return '';
  return cleaned.split(/\s+/).pop();
}

/**
 * Devuelve { nombre, tld, ivaPct } para el label del pipeline dado.
 * Si la sede no está configurada, conserva el comportamiento previo: el nombre es la
 * última palabra del label y se usan los valores por defecto (gt / 12%).
 */
export function sucursalConfig(pipelineLabel) {
  const norm = normalizeKey(pipelineLabel);
  const match = SUCURSALES.filter(
    (s) => norm === s.match || norm.endsWith(` ${s.match}`),
  ).sort((a, b) => b.match.length - a.match.length)[0];

  if (match) {
    return { nombre: match.nombre, tld: match.tld, ivaPct: match.ivaPct };
  }
  return {
    nombre: lastWord(pipelineLabel),
    tld: DEFAULT_SUCURSAL.tld,
    ivaPct: DEFAULT_SUCURSAL.ivaPct,
  };
}
