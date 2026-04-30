import { useState } from 'react';
import {
  EmptyState,
  LoadingButton,
  Text,
  hubspot,
  logger,
  useExtensionActions,
  useExtensionContext,
} from '@hubspot/ui-extensions';

hubspot.extend<'crm.record.tab'>(() => <Extension />);

const API_BASE_URL = 'https://jlsgpv2d-3000.use.devtunnels.ms';

const Extension = () => {
  const { crm } = useExtensionContext<'crm.record.tab'>();
  const { addAlert } = useExtensionActions<'crm.record.tab'>();
  const [isLoading, setIsLoading] = useState(false);
  const dealId = String(crm.objectId);

  const handleSendQuote = async () => {
    setIsLoading(true);

    try {
      logger.info(`Sending deal ID ${dealId} to Fastify API`);

      const response = await hubspot.fetch(`${API_BASE_URL}/deals/send-quote`, {
        method: 'POST',
        timeout: 10000,
        body: { dealId },
      });

      if (!response.ok) {
        throw new Error(`Fastify API responded with ${response.status}`);
      }

      const data = await response.json();
      logger.info(`Fastify API response for deal ID ${data.dealId}`);

      addAlert({
        type: 'success',
        title: 'Cotización enviada',
        message: `Deal ID enviado: ${data.dealId}`,
      });
    } catch (error) {
      logger.error(error instanceof Error ? error.message : 'Unknown error');

      addAlert({
        type: 'danger',
        title: 'Error',
        message: 'No se pudo llamar al API de cotización.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <EmptyState
        title="Enviar cotización"
        layout="vertical"
        imageName="building"
      >
        <Text>Deal ID: {dealId}</Text>

        <LoadingButton
          variant="primary"
          loading={isLoading}
          onClick={handleSendQuote}
        >
          Enviar cotización
        </LoadingButton>
      </EmptyState>
    </>
  );
};
