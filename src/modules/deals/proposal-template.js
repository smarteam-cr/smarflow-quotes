import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'designs/proposal.html',
);

export async function buildProposalHtml({ companies, contacts, lineItems }) {
  const template = await readFile(TEMPLATE_PATH, 'utf8');
  const company = companies[0]?.properties ?? {};
  const contact = contacts[0]?.properties ?? null;

  return template
    .replaceAll('{{companyName}}', escapeHtml(company.name ?? ''))
    .replaceAll('{{contactInfo}}', buildContactHtml(contact))
    .replaceAll('{{lineItemRows}}', buildLineItemRows(lineItems));
}

function buildLineItemRows(lineItems) {
  if (lineItems.length === 0) {
    return '<tr><td class="empty" colspan="5">Sin line items asociados.</td></tr>';
  }

  return lineItems
    .map((lineItem) => {
      const properties = lineItem.properties ?? {};
      const quantity = parseNumber(properties.quantity);
      const price = parseNumber(properties.price);
      const total = quantity * price;

      return `
        <tr>
          <td class="number">${escapeHtml(properties.quantity ?? '')}</td>
          <td>${escapeHtml(properties.name ?? '')}</td>
          <td>${escapeHtml(properties.description ?? '')}</td>
          <td class="money">${formatMoney(price)}</td>
          <td class="money">${formatMoney(total)}</td>
        </tr>
      `;
    })
    .join('');
}

function buildContactHtml(contact) {
  if (!contact) {
    return '';
  }

  const fullName = [contact.firstname, contact.lastname]
    .filter(Boolean)
    .join(' ');

  return `
    <h2>Información del contacto</h2>
    ${
      fullName
        ? `<p class="field"><span class="label">Nombre:</span> ${escapeHtml(fullName)}</p>`
        : ''
    }
    ${
      contact.email
        ? `<p class="field"><span class="label">Email:</span> ${escapeHtml(contact.email)}</p>`
        : ''
    }
  `;
}

function parseNumber(value) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : 0;
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
