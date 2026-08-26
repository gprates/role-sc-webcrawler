import { connectToDatabase, closeDatabaseConnection } from './database/mongodb.connection';
import { RawCrawlRepository } from './database/repositories/raw-crawl.repository';
import { CRAWLERS, CrawlerKey } from './crawlers/crawler.registry';
import type { RawCrawlInsert } from './types/raw-crawl.types';
import { createLogger } from './utils/logger.utils';

const logger = createLogger('Runner');

export interface RunResult {
  crawledPages: number;
  saved: number;
  backfilled: number;
  skipped: number;
  withImage: number;
  elapsedSeconds: string;
}

export const runCrawler = async (key: CrawlerKey, maxPages: number): Promise<RunResult> => {
  const startedAt = Date.now();
  const entry = CRAWLERS[key];

  logger.info(`Iniciando crawler: ${entry.label} (max. ${maxPages} paginas)`);

  const db = await connectToDatabase();
  await RawCrawlRepository.ensureIndexes(db);

  const crawler = entry.create(maxPages);
  const result = await crawler.run();

  if (!result.success) {
    await closeDatabaseConnection();
    throw new Error(result.error ?? 'Crawler falhou sem mensagem de erro');
  }

  const { items, crawledPages } = result.data as {
    items: RawCrawlInsert[];
    crawledPages: number;
  };

  const withImage = items.filter((item) => !!item.imageUrl).length;

  logger.info(
    `Crawling concluido: ${crawledPages} paginas visitadas, ${items.length} artigos coletados, ${withImage} com imagem`,
  );

  if (items.length > 0 && withImage < items.length) {
    const semImagem = items.filter((item) => !item.imageUrl).map((item) => item.url);
    logger.info(`Artigos sem imagem (${semImagem.length}):`, { urls: semImagem.slice(0, 10) });
  }

  const { saved, backfilled, skipped } = await RawCrawlRepository.saveMany(db, items);
  logger.info(
    `Persistencia: ${saved} salvos, ${backfilled} imagens preenchidas, ${skipped} duplicatas ignoradas`,
  );

  await closeDatabaseConnection();

  const elapsedMs = Date.now() - startedAt;
  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
  logger.info(`Execucao concluida em ${elapsedSeconds}s`);

  return { crawledPages, saved, backfilled, skipped, withImage, elapsedSeconds };
};
