import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sucursalConfig } from './sucursal-config.js';

test('Guatemala: nombre, tld e iva', () => {
  assert.deepEqual(sucursalConfig('Ventas Guatemala'), {
    nombre: 'Guatemala',
    tld: 'gt',
    ivaPct: '12',
  });
});

test('Honduras: nombre, tld e iva (15%)', () => {
  assert.deepEqual(sucursalConfig('Ventas Honduras'), {
    nombre: 'Honduras',
    tld: 'hn',
    ivaPct: '15',
  });
});

test('match insensible a mayúsculas/acentos', () => {
  assert.equal(sucursalConfig('Ventas HONDURAS').tld, 'hn');
  assert.equal(sucursalConfig('PIPELINE Honduras').ivaPct, '15');
});

test('match por "termina con" soporta labels de varias palabras', () => {
  assert.equal(sucursalConfig('Pipeline de ventas Honduras').nombre, 'Honduras');
});

test('no hay falso positivo si la palabra está pegada (sin separador)', () => {
  // "miHonduras" NO debe matchear honduras: se exige límite de palabra.
  assert.deepEqual(sucursalConfig('Ventas miHonduras'), {
    nombre: 'miHonduras',
    tld: 'gt',
    ivaPct: '12',
  });
});

test('sucursal no configurada → nombre = última palabra y defaults (gt, 12)', () => {
  assert.deepEqual(sucursalConfig('Ventas Panamá'), {
    nombre: 'Panamá',
    tld: 'gt',
    ivaPct: '12',
  });
});

test('label vacío o indefinido → nombre vacío y defaults', () => {
  assert.deepEqual(sucursalConfig(''), { nombre: '', tld: 'gt', ivaPct: '12' });
  assert.deepEqual(sucursalConfig(undefined), { nombre: '', tld: 'gt', ivaPct: '12' });
});
