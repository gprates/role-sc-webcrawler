import type { BaseCrawler } from './base/base.crawler';
import type { RawCrawlInsert } from '../types/raw-crawl.types';
import { CamboriuCrawler } from './services/camboriu.crawler';
import { ItajaiCulturalCrawler } from './services/itajai-cultural.crawler';
import { BombinhasCrawler } from './services/bombinhas.crawler';
import { BalnearioCamboriuCrawler } from './services/balneario-camboriu.crawler';
import { PortoBeloCrawler } from './services/porto-belo.crawler';
import { ItapemaCrawler } from './services/itapema.crawler';
import type { CamboriuData } from './services/camboriu.crawler';
import type { ItajaiCulturalData } from './services/itajai-cultural.crawler';
import type { BombinhasData } from './services/bombinhas.crawler';
import type { BalnearioCamboriuData } from './services/balneario-camboriu.crawler';
import type { PortoBeloData } from './services/porto-belo.crawler';
import type { ItapemaData } from './services/itapema.crawler';

export type CrawlerKey =
  | 'camboriu'
  | 'itajai-cultural'
  | 'bombinhas'
  | 'balneario-camboriu'
  | 'porto-belo'
  | 'itapema';

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
  bombinhas: {
    label: 'Fundacao Municipal de Cultura de Bombinhas',
    create: (maxPages) => new BombinhasCrawler(maxPages) as BaseCrawler<BombinhasData>,
  },
  'balneario-camboriu': {
    label: 'Fundacao Cultural de Balneario Camboriu',
    create: (maxEvents) =>
      new BalnearioCamboriuCrawler(maxEvents) as BaseCrawler<BalnearioCamboriuData>,
  },
  'porto-belo': {
    label: 'Municipio de Porto Belo',
    create: (maxPages) => new PortoBeloCrawler(maxPages) as BaseCrawler<PortoBeloData>,
  },
  itapema: {
    label: 'Municipio de Itapema',
    create: (maxPages) => new ItapemaCrawler(maxPages) as BaseCrawler<ItapemaData>,
  },
};

export const isCrawlerKey = (key: string): key is CrawlerKey => key in CRAWLERS;
