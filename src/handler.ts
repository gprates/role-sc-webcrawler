import 'dotenv/config';
import { runCrawler } from './runner';
import { isCrawlerKey, CrawlerKey } from './crawlers/crawler.registry';
import { createLogger } from './utils/logger.utils';

const logger = createLogger('Handler');

interface LambdaEvent {
  municipality: CrawlerKey;
  maxPages?: number;
}

interface LambdaResponse {
  statusCode: number;
  body: string;
}

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  const { municipality, maxPages = 5 } = event;

  if (!isCrawlerKey(municipality)) {
    logger.error(`Municipio invalido recebido: ${municipality}`);
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: `Municipio invalido: ${municipality}` }),
    };
  }

  try {
    const result = await runCrawler(municipality, maxPages);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, ...result }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Erro na execucao do handler', { error: message });
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
};
