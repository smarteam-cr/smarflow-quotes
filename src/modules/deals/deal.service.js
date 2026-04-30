import { Client } from '@hubspot/api-client';
import { badRequest, serverError } from '../../utils/errors.js';

const DEAL_PROPERTIES = ['dealname', 'amount', 'pipeline', 'dealstage'];
const DEAL_ASSOCIATIONS = ['companies', 'contacts', 'line_items'];

export function createDealService({ hubspotAccessToken, logger }) {
  const hubspotClient = hubspotAccessToken
    ? new Client({
        accessToken: hubspotAccessToken,
        numberOfApiCallRetries: 3,
      })
    : null;

  async function sendQuote(dealId) {
    if (!dealId) {
      throw badRequest('dealId is required');
    }

    if (!hubspotClient) {
      throw serverError(
        'HubSpot access token is required. Set HUBSPOT_ACCESS_TOKEN or HUBSPOT_PRIVATE_APP_TOKEN.',
      );
    }

    logger.info({ dealId }, 'Fetching deal data from HubSpot');

    const deal = await hubspotClient.crm.deals.basicApi.getById(
      dealId,
      DEAL_PROPERTIES,
      undefined,
      DEAL_ASSOCIATIONS,
    );
    const associations = await getDealAssociations(dealId);
    const payload = {
      dealId,
      generatedAt: new Date().toISOString(),
      deal: {
        id: deal.id,
        properties: deal.properties,
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
        archived: deal.archived,
        associations: deal.associations,
      },
      associations,
    };

    logger.info({ dealId }, 'Deal quote data fetched');

    return payload;
  }

  async function getDealAssociations(dealId) {
    const entries = await Promise.all(
      DEAL_ASSOCIATIONS.map(async (associationType) => [
        associationType,
        await getAllAssociationPages(dealId, associationType),
      ]),
    );

    return Object.fromEntries(entries);
  }

  async function getAllAssociationPages(dealId, associationType) {
    const results = [];
    let after;

    do {
      const page = await hubspotClient.crm.associations.v4.basicApi.getPage(
        'deals',
        dealId,
        associationType,
        after,
        500,
      );

      results.push(...(page.results ?? []));
      after = page.paging?.next?.after;
    } while (after);

    return results;
  }

  return {
    sendQuote,
  };
}
