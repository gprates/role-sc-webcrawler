import type { BaseCrawler } from './base/base.crawler';
import type { RawCrawlInsert } from '../types/raw-crawl.types';
import { CamboriuCrawler } from './services/camboriu.crawler';
import { ItajaiCulturalCrawler } from './services/itajai-cultural.crawler';
import type { CamboriuData } from './services/camboriu.crawler';
import type { ItajaiCulturalData } from './services/itajai-cultural.crawler';

export type CrawlerKey = 'camboriu' | 'itajai-cultural';

export interface CrawlerEntry {
  label: string;
  create: (
    maxPages: number,
  ) => BaseCrawler<{ items: RawCrawlInsert[]; totalPages: number; crawledPages: number }>;
}

export const CRAWLERS: Record<CrawlerKey, CrawlerEntry> = {
  camboriu: {
    label: 'Camboriu',
    create: (maxPages) => new CamboriuCrawler(maxPages) as BaseCrawler<CamboriuData>,
  },
  'itajai-cultural': {
    label: 'Fundacao Cultural de Itajai',
    create: (maxPages) =>
      new ItajaiCulturalCrawler(maxPages) as BaseCrawler<ItajaiCulturalData>,
  },
};

export const isCrawlerKey = (key: string): key is CrawlerKey => key in CRAWLERS;
