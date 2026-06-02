import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProposalHtml } from './proposal-template.js';

const viewModel = {
  empresa: 'Spectrum',
  codigoProyecto: 'Mw_19012026',
  contacto: 'Karla Sierra',
  direccionProyecto: 'Escuintla',
  vigencia: 'martes, enero 27, 2026',
  tiempoEntrega: 'línea1<br>línea2',
  tiempoEjecucion: 'Según obra',
  asesor: 'Jorge Arauz (jarauz@x.com)',
  asesorNombre: 'Jorge Arauz',
  obra: 'MABE',
  lugarEntrega: 'Proyecto',
  moneda: 'Q',
  tasaCambio: 'N/A',
  garantia: '18 meses',
  fecha: 'martes, enero 27, 2026',
  numeroRegistro: 'CSS KR18',
  telefonos: '37587673',
  sucursal: 'Guatemala',
  condicionPago: 'Anticipo 60%<br>Estimaciones 40%',
  categories: [
    { nombre: 'Cubierta', items: [
      { cantidad: '15,600.00', nombre: 'Cubierta KR18', datosTecnicos: 'd1<br>d2', descripcion: 'SUMINISTRO', precioUnitario: 'Q 281.53', total: 'Q 4,391,868.00' },
    ]},
  ],
  subtotal: 'Q 4,693,849.80',
  iva: 'Q 563,261.98',
  totalGeneral: 'Q 5,257,111.77',
};

test('el HTML resultante no deja placeholders sin reemplazar', async () => {
  const html = await buildProposalHtml(viewModel);
  assert.ok(!html.includes('{{'), 'no debe quedar ningún {{placeholder}}');
});

test('el HTML incluye categoría e items con 6 celdas', async () => {
  const html = await buildProposalHtml(viewModel);
  assert.ok(html.includes('Spectrum'));
  assert.ok(html.includes('colspan="6"'));
  assert.ok(html.includes('Cubierta KR18'));
  assert.ok(html.includes('Q 4,391,868.00'));
  assert.ok(html.includes('d1<br>d2'));
});

test('renderiza con categories vacío sin error', async () => {
  const html = await buildProposalHtml({ ...viewModel, categories: [] });
  assert.ok(!html.includes('{{'));
});

test('la firma del medio usa el nombre del asesor (sin email)', async () => {
  const html = await buildProposalHtml(viewModel);
  assert.ok(html.includes('<p class="nombre">Jorge Arauz</p>'));
});
