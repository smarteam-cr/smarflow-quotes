import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'designs/proposal.html',
);

// --- Datos de ejemplo (mockup Spectrum) ---
const MOCK_DATA = {
  companyName: 'Spectrum',
  projectNumber: 'Mw_19012026',
  contactName: 'Karla Sierra',
  projectAddress: 'Synergy Industrial Park, Escuintla',
  validity: '15 días',
  deliveryTime:
    'LAMINA - Se cuenta con stock para el 50% de la nave, resto 12 semanas de fabricación e importación AISLANTE -3 a 4 Semanas Luego de aceptación de oferta + pago de anticipo.',
  executionTime: 'Según programación de obra',
  advisorName: 'Mario Wer (4151-1852)',
  workName: 'MABE',
  deliveryPlace: 'Proyecto',
  currency: 'Q',
  exchangeRate: 'N/A',
  warranty: '18 meses',
  date: 'martes, enero 27, 2026',
  registryNumber: 'CSS KR18 C22 (0.75mm) + LANA MINERAL MBI 5" R-16',
  phones: '(+502) 37587673',
  branch: 'Guatemala',
  paymentCondition:
    'Anticipo 60%<br>Estimaciones 40%<br>Avance semanal con trámite de pago de 30 días.',

  categories: [
    {
      name: 'CUBIERTA',
      items: [
        {
          quantity: 15600.0,
          name: 'M2: Cubierta Construastruding seam KR 18 C22 (0.75mm) lámina prepintada al horno color blanco + Lana mineral de 5" (MBI R-16)',
          description: 'SUMINISTRO E INSTALACIÓN<br>*ROLADO EN SITIO',
          price: 281.53,
        },
        {
          quantity: 1160.0,
          name: 'Mln: Flashing superior, inferior, esquinero y laterales C26, prepintada al horno color blanco exterior / blanco interior, desarrollo máx 0.61mt',
          description: 'SUMINISTRO E INSTALACIÓN',
          price: 69.94,
        },
      ],
    },
    {
      name: 'CANALES',
      items: [
        {
          quantity: 520.0,
          name: 'Mln: Canales con lámina prepintada color blanco C22, desarrollo máx 1.22mt',
          description:
            'SUMINISTRO E INSTALACIÓN<br>*NO INCLUYE PESCANTES',
          price: 319.43,
        },
      ],
    },
    {
      name: 'TRANSPORTE',
      items: [
        {
          quantity: 15.0,
          name: 'FLETE',
          description: 'SERVICIO',
          price: 3650.0,
        },
      ],
    },
  ],
};

/**
 * Construye el HTML de la propuesta.
 * Por ahora usa datos de ejemplo (MOCK_DATA).
 * Cuando conectemos HubSpot, recibirá { companies, contacts, lineItems, deal }.
 */
export async function buildProposalHtml() {
  const template = await readFile(TEMPLATE_PATH, 'utf8');
  const data = MOCK_DATA;

  // Calcular totales
  const subtotal = calculateSubtotal(data.categories);
  const tax = subtotal * 0.12;
  const grandTotal = subtotal + tax;

  return template
    // Info - Datos del proyecto
    .replaceAll('{{companyName}}', escapeHtml(data.companyName))
    .replaceAll('{{projectNumber}}', escapeHtml(data.projectNumber))
    .replaceAll('{{contactName}}', escapeHtml(data.contactName))
    .replaceAll('{{projectAddress}}', escapeHtml(data.projectAddress))
    .replaceAll('{{validity}}', escapeHtml(data.validity))
    .replaceAll('{{deliveryTime}}', escapeHtml(data.deliveryTime))
    .replaceAll('{{executionTime}}', escapeHtml(data.executionTime))
    // Info - Datos de cotización
    .replaceAll('{{advisorName}}', escapeHtml(data.advisorName))
    .replaceAll('{{workName}}', escapeHtml(data.workName))
    .replaceAll('{{deliveryPlace}}', escapeHtml(data.deliveryPlace))
    .replaceAll('{{currency}}', escapeHtml(data.currency))
    .replaceAll('{{exchangeRate}}', escapeHtml(data.exchangeRate))
    .replaceAll('{{warranty}}', escapeHtml(data.warranty))
    // Info - Otros datos
    .replaceAll('{{date}}', escapeHtml(data.date))
    .replaceAll('{{registryNumber}}', escapeHtml(data.registryNumber))
    .replaceAll('{{phones}}', escapeHtml(data.phones))
    .replaceAll('{{branch}}', escapeHtml(data.branch))
    .replaceAll('{{paymentCondition}}', data.paymentCondition) // permite <br>
    // Productos
    .replaceAll('{{lineItemRows}}', buildCategoryRows(data.categories))
    // Totales
    .replaceAll('{{subtotal}}', `Q ${formatMoney(subtotal)}`)
    .replaceAll('{{tax}}', `Q ${formatMoney(tax)}`)
    .replaceAll('{{grandTotal}}', `Q ${formatMoney(grandTotal)}`);
}

/**
 * Genera los <tbody> de categorías con sus items.
 * Cada categoría va en un <tbody> separado para que CSS pueda
 * aplicar break-inside: avoid por grupo.
 */
function buildCategoryRows(categories) {
  return categories
    .map((category) => {
      const sectionRow = `
        <tr class="section-row">
          <td colspan="5">${escapeHtml(category.name)}</td>
        </tr>`;

      const itemRows = category.items
        .map((item) => {
          const total = item.quantity * item.price;
          return `
          <tr>
            <td>${formatMoney(item.quantity)}</td>
            <td><strong>${item.name}</strong></td>
            <td>${item.description}</td>
            <td class="text-right">Q ${formatMoney(item.price)}</td>
            <td class="text-right">Q ${formatMoney(total)}</td>
          </tr>`;
        })
        .join('');

      return `<tbody>${sectionRow}${itemRows}</tbody>`;
    })
    .join('');
}

function calculateSubtotal(categories) {
  return categories.reduce((sum, category) => {
    return (
      sum +
      category.items.reduce((catSum, item) => {
        return catSum + item.quantity * item.price;
      }, 0)
    );
  }, 0);
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
