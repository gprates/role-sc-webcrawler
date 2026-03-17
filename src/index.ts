import 'dotenv/config';
import { CRAWLERS, isCrawlerKey, CrawlerKey } from './crawlers/crawler.registry';
import { runCrawler } from './runner';
import { createLogger } from './utils/logger.utils';

const logger = createLogger('CLI');

const resolveCrawlerKey = (): CrawlerKey => {
  const arg = process.argv[2];
  if (arg && isCrawlerKey(arg)) return arg;

  logger.error('Crawler invalido ou nao informado. Use: pnpm dev <crawler>');
  logger.error(`Disponiveis: ${Object.keys(CRAWLERS).join(', ')}`);
  process.exit(1);
};

const run = async (): Promise<void> => {
  const key = resolveCrawlerKey();
  const maxPages = Number(process.argv[3]) || 5;

  await runCrawler(key, maxPages);
};

run().catch((error) => {
  logger.error('Erro fatal na execucao', { error });
  process.exit(1);
});
