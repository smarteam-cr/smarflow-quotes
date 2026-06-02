import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  multilineToHtml,
  formatNumber,
  formatMoney,
  formatDate,
} from './format.util.js';

test('escapeHtml escapa caracteres especiales', () => {
  assert.equal(escapeHtml('<b> & "x" \''), '&lt;b&gt; &amp; &quot;x&quot; &#039;');
  assert.equal(escapeHtml(null), '');
});

test('multilineToHtml escapa y convierte \\n en <br>', () => {
  assert.equal(multilineToHtml('a\nb'), 'a<br>b');
  assert.equal(multilineToHtml('<x>\ny'), '&lt;x&gt;<br>y');
  assert.equal(multilineToHtml(''), '');
  assert.equal(multilineToHtml(null), '');
});

test('formatNumber formatea es-GT con 2 decimales', () => {
  assert.equal(formatNumber(15600), '15,600.00');
  assert.equal(formatNumber('281.53'), '281.53');
  assert.equal(formatNumber(null), '');
  assert.equal(formatNumber('abc'), '');
});

test('formatMoney antepone el código de moneda', () => {
  assert.equal(formatMoney(4391868, 'GTQ'), 'GTQ 4,391,868.00');
  assert.equal(formatMoney('281.53', 'USD'), 'USD 281.53');
  assert.equal(formatMoney(100, 'EUR'), 'EUR 100.00');
  assert.equal(formatMoney(50, ''), '50.00');
  assert.equal(formatMoney(null, 'GTQ'), '');
});

test('formatDate usa la zona del portal y el orden del mockup', () => {
  assert.equal(
    formatDate('2026-01-27T12:00:00.000Z', 'America/Guatemala'),
    'martes, enero 27, 2026',
  );
  assert.equal(formatDate(null, 'America/Guatemala'), '');
  assert.equal(formatDate('no-es-fecha', 'America/Guatemala'), '');
});

test('formatDate cae al timezone por defecto si el tz es inválido', () => {
  assert.equal(
    formatDate('2026-01-27T12:00:00.000Z', 'Garbage/TZ'),
    'martes, enero 27, 2026',
  );
});

test('multilineToHtml normaliza saltos de Windows (\\r\\n)', () => {
  assert.equal(multilineToHtml('a\r\nb'), 'a<br>b');
});
