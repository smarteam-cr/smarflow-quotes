import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'designs/proposal.html',
);

/**
 * Renderiza el HTML de la propuesta a partir del view model.
 * Todos los valores del view model ya vienen escapados / formateados.
 */
export async function buildProposalHtml(viewModel) {
  const template = await readFile(TEMPLATE_PATH, 'utf8');
  return template
    .replaceAll('{{companyName}}', viewModel.empresa)
    .replaceAll('{{projectNumber}}', viewModel.codigoProyecto)
    .replaceAll('{{contactName}}', viewModel.contacto)
    .replaceAll('{{projectAddress}}', viewModel.direccionProyecto)
    .replaceAll('{{validity}}', viewModel.vigencia)
    .replaceAll('{{deliveryTime}}', viewModel.tiempoEntrega)
    .replaceAll('{{executionTime}}', viewModel.tiempoEjecucion)
    .replaceAll('{{advisorName}}', viewModel.asesor)
    .replaceAll('{{advisorSignatureName}}', viewModel.asesorNombre)
    .replaceAll('{{workName}}', viewModel.obra)
    .replaceAll('{{deliveryPlace}}', viewModel.lugarEntrega)
    .replaceAll('{{currency}}', viewModel.moneda)
    .replaceAll('{{exchangeRate}}', viewModel.tasaCambio)
    .replaceAll('{{warranty}}', viewModel.garantia)
    .replaceAll('{{date}}', viewModel.fecha)
    .replaceAll('{{registryNumber}}', viewModel.numeroRegistro)
    .replaceAll('{{phones}}', viewModel.telefonos)
    .replaceAll('{{branch}}', viewModel.sucursal)
    .replaceAll('{{paymentCondition}}', viewModel.condicionPago)
    .replaceAll('{{lineItemRows}}', buildCategoryRows(viewModel.categories))
    .replaceAll('{{subtotal}}', viewModel.subtotal)
    .replaceAll('{{tax}}', viewModel.iva)
    .replaceAll('{{grandTotal}}', viewModel.totalGeneral);
}

/**
 * Genera un <tbody> por categoría con su fila de sección y sus items.
 * Cada categoría va en su propio <tbody> para que CSS aplique
 * break-inside: avoid por grupo.
 */
function buildCategoryRows(categories) {
  if (!categories || categories.length === 0) {
    return '';
  }

  return categories
    .map((category) => {
      const sectionRow = `
        <tr class="section-row">
          <td colspan="6">${category.nombre}</td>
        </tr>`;

      const itemRows = category.items
        .map(
          (item) => `
          <tr>
            <td>${item.cantidad}</td>
            <td><strong>${item.nombre}</strong></td>
            <td>${item.datosTecnicos}</td>
            <td>${item.descripcion}</td>
            <td class="text-right">${item.precioUnitario}</td>
            <td class="text-right">${item.total}</td>
          </tr>`,
        )
        .join('');

      return `<tbody>${sectionRow}${itemRows}</tbody>`;
    })
    .join('');
}
