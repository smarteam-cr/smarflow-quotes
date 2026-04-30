export function createDealController({ dealService }) {
  return {
    sendQuote: async (request, reply) => {
      const { dealId } = request.body;
      const result = await dealService.sendQuote(String(dealId ?? ''));

      return reply.send(result);
    },
  };
}
