import { Page } from 'playwright';
import { BaseCrawler } from '../base/base.crawler';
import { SITES } from '../../config/sites.config';
import { RawCrawlInsert } from '../../types/raw-crawl.types';
import { navigateTo, elementExists, getInnerText } from '../../utils/page.utils';
import { WaitStrategy } from '../../enums/wait-strategy.enum';

interface NewsCard {
  url: string;
  title: string;
  date: string;
  excerpt: string;
}

export interface PortoBeloData {
  items: RawCrawlInsert[];
  totalPages: number;
  crawledPages: number;
}

const SELECTORS = {
  LISTING: {
    CARD: 'article.post.type-post',
    TITLE_LINK: '.entry-title a',
    DATE: 'time.entry-date.published',
    EXCERPT: '.entry-content p',
  },
  ARTICLE: {
    CONTENT: '.entry-content',
  },
} as const;

const SITE = SITES.PORTO_BELO;

export class PortoBeloCrawler extends BaseCrawler<PortoBeloData> {
  private maxPages: number;

  constructor(maxPages = 5) {
    super(SITE);
    this.maxPages = maxPages;
  }

  protected async navigate(): Promise<void> {
    await navigateTo(this.page, SITE.listingUrl, WaitStrategy.LOAD);
    await this.page.waitForSelector(SELECTORS.LISTING.CARD);
  }

  protected async extract(): Promise<PortoBeloData> {
    const items: RawCrawlInsert[] = [];
    let crawledPages = 0;

    while (crawledPages < this.maxPages) {
      const pageNumber = crawledPages + 1;
      const pageUrl = this.buildPageUrl(pageNumber);
      this.logger.info(`Crawling pagina ${pageNumber}: ${pageUrl}`);

      if (crawledPages > 0) {
        await navigateTo(this.page, pageUrl, WaitStrategy.LOAD);
        await this.page.waitForSelector(SELECTORS.LISTING.CARD);
      }

      const cards = await this.extractCards(this.page);
      this.logger.info(`Encontrados ${cards.length} cards na pagina ${pageNumber}`);

      if (cards.length === 0) {
        this.logger.info('Sem cards, encerrando paginacao');
        break;
      }

      for (const card of cards) {
        const rawCrawl = await this.extractArticle(card);
        if (rawCrawl) items.push(rawCrawl);
      }

      crawledPages++;
    }

    return { items, totalPages: crawledPages, crawledPages };
  }

  private buildPageUrl(pageNumber: number): string {
    if (pageNumber === 1) return SITE.listingUrl;
    const base = SITE.listingUrl.endsWith('/') ? SITE.listingUrl : `${SITE.listingUrl}/`;
    return `${base}page/${pageNumber}/`;
  }

  private async extractCards(page: Page): Promise<NewsCard[]> {
    return page.$$eval(
      SELECTORS.LISTING.CARD,
      (articles, sel) =>
        articles
          .map((article) => {
            const titleLink = article.querySelector(sel.TITLE_LINK);
            const url = titleLink?.getAttribute('href') ?? '';
            const title = titleLink?.textContent?.trim() ?? '';
            const dateEl = article.querySelector(sel.DATE);
            const date = dateEl?.getAttribute('datetime') ?? '';
            const excerpt = article.querySelector(sel.EXCERPT)?.textContent?.trim() ?? '';
            return { url, title, date, excerpt };
          })
          .filter((c) => !!c.url && !!c.title),
      SELECTORS.LISTING,
    );
  }

  private async extractArticle(card: NewsCard): Promise<RawCrawlInsert | null> {
    this.logger.info(`Extraindo artigo: ${card.title}`);

    try {
      await navigateTo(this.page, card.url, WaitStrategy.LOAD);
      await this.page.waitForSelector(SELECTORS.ARTICLE.CONTENT);
      const fullText = await this.getArticleText(this.page, card.excerpt);
      return this.buildRawCrawl(card, fullText);
    } catch (error) {
      this.logger.error(`Erro ao extrair artigo: ${card.url}`, { error });
      return this.buildRawCrawl(card, card.excerpt);
    }
  }

  private async getArticleText(page: Page, fallback: string): Promise<string> {
    if (await elementExists(page, SELECTORS.ARTICLE.CONTENT)) {
      const text = await getInnerText(page, SELECTORS.ARTICLE.CONTENT);
      if (text.trim().length > 100) return text.trim();
    }

    return fallback;
  }

  private buildRawCrawl(card: NewsCard, body: string): RawCrawlInsert {
    return {
      site: SITE.name,
      municipality: SITE.municipality,
      url: card.url,
      title: card.title,
      rawText: `${card.title}\n\n${card.date}\n\n${body}`,
      publishedAt: card.date,
      crawledAt: new Date(),
      processed: false,
    };
  }
}
