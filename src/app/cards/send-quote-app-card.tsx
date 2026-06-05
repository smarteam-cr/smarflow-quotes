import { useState } from 'react';
import {
  Alert,
  Flex,
  Link,
  LoadingButton,
  Text,
  hubspot,
  logger,
  useExtensionActions,
  useExtensionContext,
} from '@hubspot/ui-extensions';

hubspot.extend<'crm.record.tab'>(() => <Extension />);

const API_BASE_URL = 'https://smartquotes.smarteamcr.com';

// Distingue un error de aplicación del backend (mensaje en español para el operador)
// de un fallo de transporte/HTTP, sin depender de coincidencias de texto frágiles.
class BackendAppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackendAppError';
  }
}
class BackendHttpError extends Error {
  constructor(status: number) {
    super(`Fastify API responded with ${status}`);
    this.name = 'BackendHttpError';
  }
}

interface QuoteResult {
  url: string;
  generatedAt: string;
}

function formatGeneratedAt(iso: string): string {
  if (!iso) {
    return '';
  }
  try {
    return new Intl.DateTimeFormat('es-GT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const Extension = () => {
  const { crm } = useExtensionContext<'crm.record.tab'>();
  const { addAlert } = useExtensionActions<'crm.record.tab'>();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dealId = String(crm.objectId);

  const handleCreateQuote = async () => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      logger.info(`Creating quote for deal ID ${dealId}`);

      const response = await hubspot.fetch(`${API_BASE_URL}/deals/send-quote`, {
        method: 'POST',
        timeout: 60000,
        body: { dealId },
      });

      if (!response.ok) {
        let serverMessage = '';
        try {
          const errBody = await response.json();
          serverMessage = typeof errBody?.message === 'string' ? errBody.message : '';
        } catch {
          serverMessage = '';
        }
        if (serverMessage) {
          throw new BackendAppError(serverMessage);
        }
        throw new BackendHttpError(response.status);
      }

      const data = await response.json();
      logger.info(`Fastify API response for deal ID ${data.dealId}`);

      setResult({ url: data.pdf?.url, generatedAt: data.generatedAt });
      addAlert({
        type: 'success',
        title: 'Cotización generada',
        message: 'La cotización se generó correctamente.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(message);
      if (error instanceof BackendAppError) {
        // Mensaje específico del backend (p. ej. falla al actualizar "sistema").
        setErrorMsg(message);
      } else if (/timeout|timed out/i.test(message)) {
        setErrorMsg('La generación tardó demasiado. Vuelve a intentarlo.');
      } else {
        setErrorMsg('No se pudo generar la cotización. Intenta de nuevo.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Flex direction="column" gap="medium">
      <LoadingButton
        variant="primary"
        loading={isLoading}
        onClick={handleCreateQuote}
      >
        Crear cotización
      </LoadingButton>

      {result?.url ? (
        <Alert title="Cotización generada" variant="success">
          <Flex direction="column" gap="small">
            <Text>Generada el {formatGeneratedAt(result.generatedAt)}.</Text>
            <Link href={{ url: result.url, external: true }}>
              Abrir cotización (PDF)
            </Link>
          </Flex>
        </Alert>
      ) : null}

      {errorMsg ? (
        <Alert title="No se pudo generar" variant="danger">
          {errorMsg}
        </Alert>
      ) : null}
    </Flex>
  );
};
