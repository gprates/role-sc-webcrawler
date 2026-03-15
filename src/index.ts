import 'dotenv/config';
import { BaseCrawler } from './crawlers/base/base.crawler';
import { CamboriuCrawler, CamboriuData } from './crawlers/services/camboriu.crawler';
import {
  ItajaiCulturalCrawler,
  ItajaiCulturalData,
} from './crawlers/services/itajai-cultural.crawler';
import { connectToDatabase, closeDatabaseConnection } from './database/mongodb.connection';
import { RawCrawlRepository } from './database/repositories/raw-crawl.repository';
import { RawCrawlInsert } from './types/raw-crawl.types';
import { createLogger } from './utils/logger.utils';

type CrawlerKey = 'camboriu' | 'itajai-cultural';

interface CrawlerEntry {
  label: string;
  create: (
    maxPages: number,
  ) => BaseCrawler<{ items: RawCrawlInsert[]; totalPages: number; crawledPages: number }>;
}

const CRAWLERS: Record<CrawlerKey, CrawlerEntry> = {
  camboriu: {
    label: 'Camboriú',
    create: (maxPages) => new CamboriuCrawler(maxPages) as BaseCrawler<CamboriuData>,
  },
  'itajai-cultural': {
    label: 'Fundação Cultural de Itajaí',
    create: (maxPages) =>
      new ItajaiCulturalCrawler(maxPages) as BaseCrawler<ItajaiCulturalData>,
  },
};

const logger = createLogger('Runner');

const resolveCrawlerKey = (): CrawlerKey => {
  const arg = process.argv[2] as CrawlerKey | undefined;
  if (arg && arg in CRAWLERS) return arg;

  logger.error('Crawler inválido ou não informado. Use: pnpm dev <crawler>');
  logger.error(`Disponíveis: ${Object.keys(CRAWLERS).join(', ')}`);
  process.exit(1);
};

const run = async (): Promise<void> => {
  const startedAt = Date.now();
  const key = resolveCrawlerKey();
  const entry = CRAWLERS[key];
  const maxPages = Number(process.argv[3]) || 5;

  logger.info(`Iniciando crawler: ${entry.label} (máx. ${maxPages} páginas)`);

  const db = await connectToDatabase();
  await RawCrawlRepository.ensureIndexes(db);

  const crawler = entry.create(maxPages);
  const result = await crawler.run();

  if (!result.success) {
    logger.error('Crawler falhou', { error: result.error });
    await closeDatabaseConnection();
    process.exit(1);
  }

  const { items, crawledPages } = result.data as {
    items: RawCrawlInsert[];
    crawledPages: number;
  };
  logger.info(
    `Crawling concluído: ${crawledPages} páginas visitadas, ${items.length} artigos coletados`,
  );

  const { saved, skipped } = await RawCrawlRepository.saveMany(db, items);
  logger.info(`Persistência: ${saved} salvos, ${skipped} duplicatas ignoradas`);

  await closeDatabaseConnection();

  const elapsedMs = Date.now() - startedAt;
  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
  logger.info(`Execução concluída em ${elapsedSeconds}s`);
};

run().catch((error) => {
  logger.error('Erro fatal na execução', { error });
  process.exit(1);
});
