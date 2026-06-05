import { Client } from '@hubspot/api-client';
import puppeteer from 'puppeteer';
import { badRequest, serverError } from '../../utils/errors.js';
import { buildProposalHtml } from './proposal-template.js';
import { buildQuoteViewModel } from './quote-view-model.js';
import { createHubspotQuoteRepository } from './hubspot-quote.repository.js';
import {
  getAssociationIds,
  resolvePrimaryQuoteId,
  resolvePrincipalContactId,
} from './hubspot-associations.js';
import { computeSistemaValue } from './deal-sistema.js';

const DEFAULT_TIME_ZONE = 'America/Guatemala';

export function createDealService({ hubspotAccessToken, logger, storage }) {
  const hubspotClient = hubspotAccessToken
    ? new Client({ accessToken: hubspotAccessToken, numberOfApiCallRetries: 3 })
    : null;
  const repo = hubspotClient
    ? createHubspotQuoteRepository({ hubspotClient, logger })
    : null;

  async function sendQuote(dealId) {
    if (!dealId) {
      throw badRequest('dealId is required');
    }
    if (!repo) {
      throw serverError(
        'HubSpot access token is required. Set HUBSPOT_ACCESS_TOKEN or HUBSPOT_PRIVATE_APP_TOKEN.',
      );
    }

    logger.info({ dealId }, 'Fetching deal data from HubSpot');

    const deal = await repo.getDeal(dealId);
    const associations = deal.associations ?? {};
    const primaryQuoteId = resolvePrimaryQuoteId(associations);
    const principalContactId = resolvePrincipalContactId(associations);
    const companyId = getAssociationIds(associations, 'companies')[0] ?? null;
    const lineItemIds = getAssociationIds(associations, 'line_items', 'line items');
    const ownerId = deal.properties?.hubspot_owner_id ?? null;
    const pipelineId = deal.properties?.pipeline ?? null;

    const [quote, contact, company, lineItems, owner, pipelineLabel, timeZone] =
      await Promise.all([
        primaryQuoteId ? repo.getQuote(primaryQuoteId) : null,
        principalContactId ? repo.getContact(principalContactId) : null,
        companyId ? repo.getCompany(companyId) : null,
        repo.getLineItems(lineItemIds),
        ownerId
          ? repo.getOwner(ownerId).catch((err) => {
              logger.warn({ ownerId, err: err.message }, 'owner lookup failed');
              return null;
            })
          : null,
        pipelineId
          ? repo.getPipelineLabel(pipelineId).catch((err) => {
              logger.warn({ pipelineId, err: err.message }, 'pipeline lookup failed');
              return '';
            })
          : '',
        repo.getPortalTimeZone().catch(() => DEFAULT_TIME_ZONE),
      ]);

    // Recalcular y reemplazar `sistema` del negocio según los line items actuales.
    // Bloqueante a propósito: si falla, NO se genera el PDF (integridad del dato).
    const sistemaValue = computeSistemaValue(lineItems);
    try {
      await repo.updateDealSistema(dealId, sistemaValue);
    } catch (err) {
      logger.error(
        { dealId, err: err.message },
        'No se pudo actualizar sistema del negocio',
      );
      throw serverError(
        'No se pudo actualizar la propiedad "sistema" del negocio en HubSpot; no se generó la cotización. ' +
          'Verifica que las opciones de "sistema" del negocio incluyan las de los productos e inténtalo de nuevo.',
      );
    }

    const viewModel = buildQuoteViewModel({
      deal,
      company,
      contact,
      quote,
      lineItems,
      owner,
      pipelineLabel,
      timeZone,
    });

    const html = await buildProposalHtml(viewModel);
    const pdf = await createProposalPdf(html, dealId, storage);
    await repo.saveQuoteUrl(dealId, pdf.url);

    logger.info({ dealId, url: pdf.url }, 'Quote PDF generated');

    return {
      dealId,
      generatedAt: new Date().toISOString(),
      pdf: { key: pdf.key, url: pdf.url },
    };
  }

  return { sendQuote };
}

async function createProposalPdf(html, dealId, storage) {
  if (!storage) {
    throw serverError('R2 storage plugin is required to upload proposal PDFs.');
  }

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
    await page.setContent(html, {
      timeout: 15000,
      waitUntil: 'networkidle0',
    });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
    });
    const key = `quotes/propuesta-${dealId}-${Date.now()}.pdf`;
    return storage.uploadPdf({ key, body: pdfBuffer });
  } finally {
    await browser.close();
  }
}
