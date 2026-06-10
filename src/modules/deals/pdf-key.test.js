import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPdfKey } from './pdf-key.js';

test('la key vive bajo quotes/, incluye el dealId y termina en .pdf', () => {
  const key = buildPdfKey('98765');
  assert.ok(key.startsWith('quotes/propuesta-98765-'), `prefijo inesperado: ${key}`);
  assert.ok(key.endsWith('.pdf'), `sufijo inesperado: ${key}`);
});

test('dos keys del mismo deal NUNCA colisionan (entropía), aunque sea el mismo ms', () => {
  const keys = new Set();
  for (let i = 0; i < 1000; i += 1) {
    keys.add(buildPdfKey('98765'));
  }
  assert.equal(keys.size, 1000, 'todas las keys del mismo deal deben ser únicas');
});

test('deals distintos quedan en keys distintas', () => {
  assert.notEqual(buildPdfKey('111'), buildPdfKey('222'));
});
