import { Page } from 'playwright';
import { BaseCrawler } from '../base/base.crawler';
import { SITES } from '../../config/sites.config';
import { RawCrawlInsert } from '../../types/raw-crawl.types';
import { navigateTo, elementExists, getText, getTexts } from '../../utils/page.utils';
import { WaitStrategy } from '../../enums/wait-strategy.enum';
import { extractCssBackgroundUrl, normalizeImageCandidates } from '../../utils/image.utils';

interface NewsCard {
  url: string;
  title: string;
  date: string;
  excerpt: string;
  imageCandidate: string;
}

export interface CamboriuData {
  items: RawCrawlInsert[];
  totalPages: number;
  crawledPages: number;
}

const SELECTORS = {
  CARD: '.snc-premium-card',
  TITLE: '.snc-title',
  DATE: '.snc-date',
  EXCERPT: '.snc-excerpt',
  NEXT_PAGE: 'a.next.page-numbers',
  ARTICLE_CONTENT: [
    '.entry-content',
    '.elementor-widget-theme-post-content',
    'article .elementor-widget-container',
    '.wp-block-post-content',
    'main article',
  ],
} as const;

const MUNICIPALITY = SITES.CAMBORIU.municipality;
const BASE_URL = SITES.CAMBORIU.listingUrl;

export class CamboriuCrawler extends BaseCrawler<CamboriuData> {
  private maxPages: number;

  constructor(maxPages = 5) {
    super(SITES.CAMBORIU);
    this.maxPages = maxPages;
  }

  protected async navigate(): Promise<void> {
    await navigateTo(this.page, BASE_URL, WaitStrategy.DOM_CONTENT_LOADED);
  }

  protected async extract(): Promise<CamboriuData> {
    const items: RawCrawlInsert[] = [];
    let crawledPages = 0;
    let currentUrl: string = BASE_URL;

    while (currentUrl && crawledPages < this.maxPages) {
      this.logger.info(`Crawling página ${crawledPages + 1}: ${currentUrl}`);

      if (crawledPages > 0) {
        await navigateTo(this.page, currentUrl, WaitStrategy.DOM_CONTENT_LOADED);
      }

      const cards = await this.extractCards(this.page);
      this.logger.info(`Encontrados ${cards.length} cards na página ${crawledPages + 1}`);

      for (const card of cards) {
        const rawCrawl = await this.extractArticle(card);
        if (rawCrawl) {
          items.push(rawCrawl);
        }
      }

      crawledPages++;
      currentUrl = await this.getNextPageUrl(this.page);
    }

    return {
      items,
      totalPages: crawledPages,
      crawledPages,
    };
  }

  private async extractCards(page: Page): Promise<NewsCard[]> {
    return page.$$eval(SELECTORS.CARD, (cards) =>
      cards
        .map((card) => {
          const onclick = card.getAttribute('onclick') ?? '';
          const urlMatch = onclick.match(/location\.href='([^']+)'/);
          const url = urlMatch ? urlMatch[1] : '';

          const title = card.querySelector('.snc-title')?.textContent?.trim() ?? '';
          const date = card.querySelector('.snc-date')?.textContent?.trim() ?? '';
          const excerpt = card.querySelector('.snc-excerpt')?.textContent?.trim() ?? '';
          const imageCandidate =
            (card.querySelector('.snc-card-image .img-scaler') as HTMLElement | null)?.style
              .backgroundImage ?? '';

          return { url, title, date, excerpt, imageCandidate };
        })
        .filter((c) => !!c.url && !!c.title),
    );
  }

  private async extractArticle(card: NewsCard): Promise<RawCrawlInsert | null> {
    this.logger.info(`Extraindo artigo: ${card.title}`);

    const imageUrl = normalizeImageCandidates(
      [extractCssBackgroundUrl(card.imageCandidate)],
      SITES.CAMBORIU.baseUrl,
    );

    try {
      await navigateTo(this.page, card.url, WaitStrategy.DOM_CONTENT_LOADED);

      const fullText = await this.getArticleText(this.page, card.excerpt);

      return {
        site: SITES.CAMBORIU.name,
        municipality: MUNICIPALITY,
        url: card.url,
        title: card.title,
        rawText: `${card.title}\n\n${card.date}\n\n${fullText}`,
        imageUrl,
        publishedAt: card.date,
        crawledAt: new Date(),
        processed: false,
      };
    } catch (error) {
      this.logger.error(`Erro ao extrair artigo: ${card.url}`, { error });
      return {
        site: SITES.CAMBORIU.name,
        municipality: MUNICIPALITY,
        url: card.url,
        title: card.title,
        rawText: `${card.title}\n\n${card.date}\n\n${card.excerpt}`,
        imageUrl,
        publishedAt: card.date,
        crawledAt: new Date(),
        processed: false,
      };
    }
  }

  private async getArticleText(page: Page, fallback: string): Promise<string> {
    for (const selector of SELECTORS.ARTICLE_CONTENT) {
      if (await elementExists(page, selector)) {
        const texts = await getTexts(page, `${selector} p`);
        const joined = texts.join('\n').trim();
        if (joined.length > 100) {
          return joined;
        }

        const singleText = await getText(page, selector);
        if (singleText.length > 100) {
          return singleText;
        }
      }
    }

    return fallback;
  }

  private async getNextPageUrl(page: Page): Promise<string> {
    if (!(await elementExists(page, SELECTORS.NEXT_PAGE))) {
      return '';
    }

    const href = await page.getAttribute(SELECTORS.NEXT_PAGE, 'href');
    return href ?? '';
  }
}
