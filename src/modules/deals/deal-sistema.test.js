import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSistemaValue } from './deal-sistema.js';

const li = (sistema) => ({ properties: { sistema } });

test('lista vacía, indefinida o null → cadena vacía', () => {
  assert.equal(computeSistemaValue([]), '');
  assert.equal(computeSistemaValue(undefined), '');
  assert.equal(computeSistemaValue(null), '');
});

test('line items sin sistema → cadena vacía', () => {
  assert.equal(computeSistemaValue([{ properties: {} }, li('')]), '');
});

test('deduplica preservando orden y une con ; sin espacios', () => {
  assert.equal(
    computeSistemaValue([li('caso1'), li('caso1'), li('caso3')]),
    'caso1;caso3',
  );
});

test('un line item puede traer varios valores (se separan por ;)', () => {
  assert.equal(
    computeSistemaValue([li('caso1;caso2'), li('caso2;caso3')]),
    'caso1;caso2;caso3',
  );
});

test('tolera ; sobrantes y espacios dentro del valor del line item', () => {
  assert.equal(computeSistemaValue([li(';caso1;;caso2; ')]), 'caso1;caso2');
});

test('recalcula con otro conjunto de line items', () => {
  assert.equal(computeSistemaValue([li('caso2'), li('caso3')]), 'caso2;caso3');
});

test('ignora vacíos/espacios y nunca produce ; inicial', () => {
  const out = computeSistemaValue([li('caso1'), li('   '), li(''), li('caso2'), li('caso1')]);
  assert.equal(out, 'caso1;caso2');
  assert.ok(!out.startsWith(';'), 'un ; inicial haría append en HubSpot, no reemplazo');
});
