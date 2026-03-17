import 'dotenv/config';
import { handler } from './handler';
import { isCrawlerKey } from './crawlers/crawler.registry';
import { createLogger } from './utils/logger.utils';

const logger = createLogger('InvokeLocal');

const municipality = process.argv[2];
const maxPages = Number(process.argv[3]) || 1;

if (!municipality || !isCrawlerKey(municipality)) {
  logger.error('Uso: pnpm invoke <municipality> [maxPages]');
  logger.error('Exemplo: pnpm invoke camboriu 1');
  process.exit(1);
}

const event = { municipality, maxPages };

logger.info(`Simulando invocacao Lambda com evento: ${JSON.stringify(event)}`);

handler(event)
  .then((response) => {
    logger.info(`Status: ${response.statusCode}`);
    logger.info(`Body: ${response.body}`);
  })
  .catch((error) => {
    logger.error('Erro inesperado', { error });
    process.exit(1);
  });
