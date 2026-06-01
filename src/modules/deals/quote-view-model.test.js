import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuoteViewModel } from './quote-view-model.js';

function baseRaw(overrides = {}) {
  return {
    deal: {
      properties: {
        codigo_de_proyecto: 'Mw_19012026',
        tiempo_de_entrega_de_materiales: 'LAMINA - stock 50%',
        tiempo_de_ejecucion: 'Según obra',
        obra: 'MABE',
        lugar_de_entrega: 'Proyecto',
        deal_currency_code: 'GTQ',
        tasa_de_cambio: 'N/A',
        garantia: '18 meses',
        numero_de_registro: 'CSS KR18',
        condicion_de_pago: 'Anticipo 60%\nEstimaciones 40%',
        hubspot_owner_id: '65432457',
        pipeline: '123',
      },
    },
    company: { properties: { name: 'Spectrum', address: 'Escuintla' } },
    contact: { properties: { firstname: 'Karla', lastname: 'Sierra', email: 'k@x.com', phone: '37587673' } },
    quote: {
      properties: {
        hs_tcv: '4693849.80',
        hs_tax_total: '563261.98',
        hs_quote_amount: '5257111.77',
        hs_expiration_date: '2026-01-27T12:00:00.000Z',
        hs_last_published_date: '2026-01-27T12:00:00.000Z',
      },
    },
    lineItems: [
      { properties: { quantity: '15600', name: 'Cubierta KR18', datos_tecnicos: 'd1\nd2', description: 'SUMINISTRO', price: '281.53', amount: '4391868', despiece: 'Cubierta' } },
      { properties: { quantity: '1160', name: 'Flashing', description: 'SUMINISTRO', price: '69.94', amount: '81130.40', despiece: 'Cubierta' } },
      { properties: { quantity: '520', name: 'Canales', description: 'SUMINISTRO', price: '319.43', amount: '166103.60', despiece: 'Canales' } },
    ],
    owner: { firstName: 'Jorge', lastName: 'Arauz', email: 'jarauz@x.com' },
    pipelineLabel: 'Ventas Guatemala',
    timeZone: 'America/Guatemala',
    ...overrides,
  };
}

test('mapea campos de info', () => {
  const vm = buildQuoteViewModel(baseRaw());
  assert.equal(vm.empresa, 'Spectrum');
  assert.equal(vm.codigoProyecto, 'Mw_19012026');
  assert.equal(vm.contacto, 'Karla Sierra');
  assert.equal(vm.direccionProyecto, 'Escuintla');
  assert.equal(vm.asesor, 'Jorge Arauz (jarauz@x.com)');
  assert.equal(vm.moneda, 'Q');
  assert.equal(vm.sucursal, 'Guatemala');
  assert.equal(vm.fecha, 'martes, enero 27, 2026');
  assert.equal(vm.vigencia, 'martes, enero 27, 2026');
  assert.equal(vm.telefonos, '37587673');
});

test('condicion de pago (multilínea) conserva saltos como <br>', () => {
  const vm = buildQuoteViewModel(baseRaw());
  assert.equal(vm.condicionPago, 'Anticipo 60%<br>Estimaciones 40%');
});

test('tiempo de entrega (una línea) se escapa sin <br>', () => {
  const vm = buildQuoteViewModel(baseRaw());
  assert.equal(vm.tiempoEntrega, 'LAMINA - stock 50%');
});

test('agrupa line items por despiece en orden de aparición', () => {
  const vm = buildQuoteViewModel(baseRaw());
  assert.equal(vm.categories.length, 2);
  assert.equal(vm.categories[0].nombre, 'Cubierta');
  assert.equal(vm.categories[0].items.length, 2);
  assert.equal(vm.categories[1].nombre, 'Canales');
  assert.equal(vm.categories[0].items[0].cantidad, '15,600.00');
  assert.equal(vm.categories[0].items[0].precioUnitario, 'Q 281.53');
  assert.equal(vm.categories[0].items[0].total, 'Q 4,391,868.00');
  assert.equal(vm.categories[0].items[0].datosTecnicos, 'd1<br>d2');
});

test('items sin despiece van a "Sin categoría" al final', () => {
  const raw = baseRaw();
  raw.lineItems.push({ properties: { quantity: '1', name: 'Suelto', description: '', price: '10', amount: '10', despiece: '' } });
  const vm = buildQuoteViewModel(raw);
  assert.equal(vm.categories[vm.categories.length - 1].nombre, 'Sin categoría');
});

test('totales vienen de la quote', () => {
  const vm = buildQuoteViewModel(baseRaw());
  assert.equal(vm.subtotal, 'Q 4,693,849.80');
  assert.equal(vm.iva, 'Q 563,261.98');
  assert.equal(vm.totalGeneral, 'Q 5,257,111.77');
});

test('sin quote principal → totales vacíos', () => {
  const vm = buildQuoteViewModel(baseRaw({ quote: null }));
  assert.equal(vm.subtotal, '');
  assert.equal(vm.iva, '');
  assert.equal(vm.totalGeneral, '');
  assert.equal(vm.fecha, '');
  assert.equal(vm.vigencia, '');
});

test('sin contacto → contacto y teléfono vacíos', () => {
  const vm = buildQuoteViewModel(baseRaw({ contact: null }));
  assert.equal(vm.contacto, '');
  assert.equal(vm.telefonos, '');
});

test('owner QUEUE sin nombre ni email → asesor vacío', () => {
  const vm = buildQuoteViewModel(baseRaw({ owner: { firstName: undefined, lastName: undefined, email: undefined } }));
  assert.equal(vm.asesor, '');
});

test('amount nulo → total de línea vacío', () => {
  const raw = baseRaw();
  raw.lineItems = [{ properties: { quantity: '1', name: 'X', description: '', price: '10', amount: null, despiece: 'Cubierta' } }];
  const vm = buildQuoteViewModel(raw);
  assert.equal(vm.categories[0].items[0].total, '');
});
