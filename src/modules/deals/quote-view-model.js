import {
  escapeHtml,
  multilineToHtml,
  formatNumber,
  formatMoney,
  formatDate,
} from './format.util.js';
import { sucursalConfig } from './sucursal-config.js';

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
  const vigenciaDias = String(dp.vigencia_en_dias ?? '').trim();
  const sucursalCfg = sucursalConfig(pipelineLabel);

  return {
    empresa: escapeHtml(cp.name ?? ''),
    codigoProyecto: escapeHtml(qp.hs_quote_number ?? ''),
    contacto: escapeHtml(buildContactName(ct)),
    direccionProyecto: escapeHtml(cp.address ?? ''),
    vigencia: vigenciaDias ? escapeHtml(`${vigenciaDias} días`) : '',
    tiempoEntrega: escapeHtml(dp.tiempo_de_entrega_de_materiales ?? ''),
    tiempoEjecucion: escapeHtml(dp.tiempo_de_ejecucion ?? ''),
    asesor: escapeHtml(buildOwnerLabel(owner)),
    asesorNombre: escapeHtml(buildOwnerName(owner)),
    obra: escapeHtml(dp.obra ?? ''),
    lugarEntrega: escapeHtml(dp.lugar_de_entrega ?? ''),
    moneda: escapeHtml(currencyCode),
    tasaCambio: escapeHtml(dp.tasa_de_cambio ?? ''),
    garantia: escapeHtml(dp.garantia ?? ''),
    fecha: escapeHtml(formatDate(qp.hs_last_published_date, timeZone)),
    numeroRegistro: escapeHtml(dp.numero_de_registro ?? ''),
    telefonos: escapeHtml(ct.phone ?? ''),
    sucursal: escapeHtml(sucursalCfg.nombre),
    siteTld: sucursalCfg.tld,
    ivaPorcentaje: sucursalCfg.ivaPct,
    condicionPago: multilineToHtml(dp.condicion_de_pago ?? ''),
    categories: buildCategories(lineItems, currencyCode),
    subtotal: quote ? escapeHtml(formatMoney(qp.hs_tcv, currencyCode)) : '',
    iva: quote ? escapeHtml(formatMoney(qp.hs_tax_total, currencyCode)) : '',
    totalGeneral: quote ? escapeHtml(formatMoney(qp.hs_quote_amount, currencyCode)) : '',
  };
}

function buildContactName(ct) {
  return [ct.firstname, ct.lastname].filter(Boolean).join(' ').trim();
}

function buildOwnerName(owner) {
  if (!owner) return '';
  return [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
}

function buildOwnerLabel(owner) {
  if (!owner) return '';
  const name = buildOwnerName(owner);
  const email = owner.email ?? '';
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return `(${email})`;
  return '';
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
      precioUnitario: escapeHtml(formatMoney(p.price, currencyCode)),
      total: escapeHtml(formatMoney(p.amount, currencyCode)),
    });
  }

  const named = order.filter((key) => key !== SIN_CATEGORIA);
  const ordered = groups.has(SIN_CATEGORIA) ? [...named, SIN_CATEGORIA] : named;

  return ordered.map((name) => ({
    nombre: escapeHtml(name),
    items: groups.get(name),
  }));
}
