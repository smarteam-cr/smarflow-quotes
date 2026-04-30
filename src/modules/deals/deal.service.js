import { Client } from '@hubspot/api-client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { badRequest, serverError } from '../../utils/errors.js';
import { buildProposalHtml } from './proposal-template.js';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const DEAL_PROPERTIES = ['dealname', 'amount', 'pipeline', 'dealstage'];
const DEAL_ASSOCIATIONS = ['companies', 'contacts', 'line_items'];
const COMPANY_PROPERTIES = ['name', 'domain'];
const CONTACT_PROPERTIES = ['email', 'firstname', 'lastname'];
const LINE_ITEM_PROPERTIES = ['name', 'price', 'quantity', 'description'];

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
    const associations = deal.associations ?? {};
    const companyIds = getAssociationIds(associations, 'companies');
    const contactIds = getAssociationIds(associations, 'contacts');
    const lineItemIds = getAssociationIds(
      associations,
      'line_items',
      'line items',
    );

    const [companies, contacts, lineItems] = await Promise.all([
      batchReadObjects(
        hubspotClient.crm.companies.batchApi,
        companyIds,
        COMPANY_PROPERTIES,
      ),
      batchReadObjects(
        hubspotClient.crm.contacts.batchApi,
        contactIds,
        CONTACT_PROPERTIES,
      ),
      batchReadObjects(
        hubspotClient.crm.lineItems.batchApi,
        lineItemIds,
        LINE_ITEM_PROPERTIES,
      ),
    ]);

    const payload = {
      dealId,
      generatedAt: new Date().toISOString(),
      deal: {
        id: deal.id,
        properties: deal.properties,
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
        archived: deal.archived,
        associations,
      },
      companies,
      contacts,
      lineItems,
    };
    const pdfPath = await createProposalPdf(payload);
    payload.pdf = {
      path: pdfPath,
      filename: path.basename(pdfPath),
    };

    logger.info({ dealId }, 'Deal quote data fetched');

    return payload;
  }

  return {
    sendQuote,
  };
}

function getAssociationIds(associations, ...associationKeys) {
  const ids = associationKeys.flatMap((associationKey) =>
    (associations[associationKey]?.results ?? []).map((result) => result.id),
  );

  return [...new Set(ids)];
}

async function batchReadObjects(batchApi, ids, properties) {
  if (ids.length === 0) {
    return [];
  }

  const response = await batchApi.read({
    inputs: ids.map((id) => ({ id })),
    properties,
  });

  return response.results ?? [];
}

async function createProposalPdf(quoteData) {
  const pdfPath = path.resolve(
    PROJECT_ROOT,
    `propuesta-${quoteData.dealId}.pdf`,
  );
  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-crash-reporter',
      '--disable-crashpad',
    ],
  });

  try {
    const page = await browser.newPage();

    await page.setContent(await buildProposalHtml(quoteData), {
      waitUntil: 'networkidle0',
    });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '18mm',
        right: '14mm',
        bottom: '18mm',
        left: '14mm',
      },
    });

    return pdfPath;
  } finally {
    await browser.close();
  }
}
