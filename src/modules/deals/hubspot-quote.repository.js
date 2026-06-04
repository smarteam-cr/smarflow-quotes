const DEAL_PROPERTIES = [
  'codigo_de_proyecto',
  'tiempo_de_entrega_de_materiales',
  'tiempo_de_ejecucion',
  'obra',
  'lugar_de_entrega',
  'deal_currency_code',
  'tasa_de_cambio',
  'garantia',
  'vigencia_en_dias',
  'numero_de_registro',
  'condicion_de_pago',
  'hubspot_owner_id',
  'pipeline',
];
const QUOTE_PROPERTIES = [
  'hs_tcv',
  'hs_tax_total',
  'hs_quote_amount',
  'hs_last_published_date',
];
const CONTACT_PROPERTIES = ['firstname', 'lastname', 'email', 'phone'];
const COMPANY_PROPERTIES = ['name', 'address'];
const LINE_ITEM_PROPERTIES = [
  'quantity',
  'name',
  'datos_tecnicos',
  'description',
  'price',
  'amount',
  'despiece',
];
const DEFAULT_TIME_ZONE = 'America/Guatemala';

export function createHubspotQuoteRepository({ hubspotClient, logger }) {
  let cachedTimeZone = null;

  // Se usa el endpoint dado 2026-03 vía apiRequest porque es el verificado
  // que devuelve los labels de asociación (principal / deal_to_primary_quote).
  async function getDeal(dealId) {
    const query =
      `properties=${DEAL_PROPERTIES.join(',')}` +
      `&associations=quotes,contacts,companies,line_items`;
    const res = await hubspotClient.apiRequest({
      method: 'GET',
      path: `/crm/objects/2026-03/deals/${dealId}?${query}`,
    });
    if (!res.ok) {
      throw new Error(`HubSpot deal fetch failed: ${res.status}`);
    }
    return res.json();
  }

  async function getQuote(quoteId) {
    return hubspotClient.crm.quotes.basicApi.getById(
      quoteId,
      QUOTE_PROPERTIES,
      undefined,
      undefined,
      false,
    );
  }

  async function getContact(contactId) {
    return hubspotClient.crm.contacts.basicApi.getById(
      contactId,
      CONTACT_PROPERTIES,
    );
  }

  async function getCompany(companyId) {
    return hubspotClient.crm.companies.basicApi.getById(
      companyId,
      COMPANY_PROPERTIES,
    );
  }

  async function getLineItems(ids) {
    if (!ids || ids.length === 0) {
      return [];
    }
    const response = await hubspotClient.crm.lineItems.batchApi.read({
      inputs: ids.map((id) => ({ id })),
      properties: LINE_ITEM_PROPERTIES,
    });
    return response.results ?? [];
  }

  async function getOwner(ownerId) {
    return hubspotClient.crm.owners.ownersApi.getById(
      Number(ownerId),
      'id',
      false,
    );
  }

  async function getPipelineLabel(pipelineId) {
    const pipeline = await hubspotClient.crm.pipelines.pipelinesApi.getById(
      'deals',
      pipelineId,
    );
    return pipeline.label ?? '';
  }

  async function getPortalTimeZone() {
    if (cachedTimeZone) {
      return cachedTimeZone;
    }
    const res = await hubspotClient.apiRequest({
      method: 'GET',
      path: '/account-info/v3/details',
    });
    if (!res.ok) {
      return DEFAULT_TIME_ZONE;
    }
    const account = await res.json();
    cachedTimeZone = account.timeZone || DEFAULT_TIME_ZONE;
    return cachedTimeZone;
  }

  async function saveQuoteUrl(dealId, url) {
    try {
      await hubspotClient.crm.deals.basicApi.update(dealId, {
        properties: { url_de_la_ultima_cotizacion: url },
      });
    } catch (err) {
      logger.warn(
        { dealId, err: err.message },
        'No se pudo guardar el URL de la cotización en el deal',
      );
    }
  }

  return {
    getDeal,
    getQuote,
    getContact,
    getCompany,
    getLineItems,
    getOwner,
    getPipelineLabel,
    getPortalTimeZone,
    saveQuoteUrl,
  };
}
