import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAssociationIds,
  resolvePrimaryQuoteId,
  resolvePrincipalContactId,
} from './hubspot-associations.js';

const associations = {
  quotes: {
    results: [
      { id: '40075783717', type: 'deal_to_quote' },
      { id: '40138586143', type: 'deal_to_quote' },
      { id: '40138586143', type: 'deal_to_primary_quote' },
    ],
  },
  contacts: {
    results: [
      { id: '221686555787', type: 'deal_to_contact' },
      { id: '224543230295', type: 'deal_to_contact' },
      { id: '224543230295', type: 'principal' },
    ],
  },
  companies: { results: [{ id: '900', type: 'deal_to_company' }] },
  line_items: {
    results: [
      { id: '1', type: 'deal_to_line_item' },
      { id: '1', type: 'deal_to_line_item' },
      { id: '2', type: 'deal_to_line_item' },
    ],
  },
};

test('getAssociationIds deduplica y acepta varias claves', () => {
  assert.deepEqual(getAssociationIds(associations, 'companies'), ['900']);
  assert.deepEqual(getAssociationIds(associations, 'line_items', 'line items'), ['1', '2']);
  assert.deepEqual(getAssociationIds({}, 'companies'), []);
});

test('resolvePrimaryQuoteId devuelve la quote con type deal_to_primary_quote', () => {
  assert.equal(resolvePrimaryQuoteId(associations), '40138586143');
  assert.equal(resolvePrimaryQuoteId({ quotes: { results: [{ id: 'x', type: 'deal_to_quote' }] } }), null);
  assert.equal(resolvePrimaryQuoteId({}), null);
});

test('resolvePrincipalContactId devuelve el contacto con type principal', () => {
  assert.equal(resolvePrincipalContactId(associations), '224543230295');
  assert.equal(resolvePrincipalContactId({ contacts: { results: [{ id: 'y', type: 'deal_to_contact' }] } }), null);
  assert.equal(resolvePrincipalContactId({}), null);
});
