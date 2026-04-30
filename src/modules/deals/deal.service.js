import { badRequest } from '../../utils/errors.js';

export class DealService {
  constructor({ logger }) {
    this.logger = logger;
  }

  async sendQuote(dealId) {
    if (!dealId) {
      throw badRequest('dealId is required');
    }

    this.logger.info({ dealId }, 'Deal ID received from HubSpot card');

    return {
      dealId,
      message: 'Deal ID logged successfully',
    };
  }
}
