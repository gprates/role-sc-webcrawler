import { Page } from 'playwright';
import { BaseCrawler } from '../base/base.crawler';
import { SITES } from '../../config/sites.config';
import { RawCrawlInsert } from '../../types/raw-crawl.types';
import { navigateTo, elementExists, getInnerText, getTexts } from '../../utils/page.utils';
import { WaitStrategy } from '../../enums/wait-strategy.enum';

interface NewsCard {
  url: string;
  title: string;
  date: string;
  category: string;
  excerpt: string;
}

export interface ItajaiCulturalData {
  items: RawCrawlInsert[];
  totalPages: number;
  crawledPages: number;
}

const SELECTORS = {
  LISTING: {
    CARD: 'article.api-news-item',
    TITLE: 'h3.api-news-title',
    DATE: 'time.api-news-date',
    CATEGORY: 'span.api-news-category',
    EXCERPT: 'p.api-news-description',
    NEXT_PAGE: 'a.next-page',
  },
  ARTICLE: {
    BODY: 'main#main-content [class*="text-gray-800"][class*="font-light"]',
    FALLBACKS: [
      '.entry-content',
      '.post-content',
      'article .content',
      '.noticia-content',
    ],
  },
} as const;

const SITE = SITES.ITAJAI_CULTURAL;

export class ItajaiCulturalCrawler extends BaseCrawler<ItajaiCulturalData> {
  private maxPages: number;

  constructor(maxPages = 5) {
    super(SITE);
    this.maxPages = maxPages;
  }

  protected async navigate(): Promise<void> {
    await navigateTo(this.page, SITE.listingUrl, WaitStrategy.DOM_CONTENT_LOADED);
  }

  protected async extract(): Promise<ItajaiCulturalData> {
    const items: RawCrawlInsert[] = [];
    let crawledPages = 0;
    let currentUrl: string = SITE.listingUrl;

    while (currentUrl && crawledPages < this.maxPages) {
      this.logger.info(`Crawling página ${crawledPages + 1}: ${currentUrl}`);

      if (crawledPages > 0) {
        await navigateTo(this.page, currentUrl, WaitStrategy.DOM_CONTENT_LOADED);
      }

      const cards = await this.extractCards(this.page);
      this.logger.info(`Encontrados ${cards.length} cards na página ${crawledPages + 1}`);

      for (const card of cards) {
        const rawCrawl = await this.extractArticle(card);
        if (rawCrawl) items.push(rawCrawl);
      }

      crawledPages++;
      currentUrl = await this.getNextPageUrl(this.page);
    }

    return { items, totalPages: crawledPages, crawledPages };
  }

  private async extractCards(page: Page): Promise<NewsCard[]> {
    return page.$$eval(
      SELECTORS.LISTING.CARD,
      (articles, sel) =>
        articles
          .map((article) => ({
            url: article.getAttribute('data-url') ?? '',
            title: article.querySelector(sel.TITLE)?.textContent?.trim() ?? '',
            date: article.querySelector(sel.DATE)?.textContent?.trim() ?? '',
            category: article.querySelector(sel.CATEGORY)?.textContent?.trim() ?? '',
            excerpt: article.querySelector(sel.EXCERPT)?.textContent?.trim() ?? '',
          }))
          .filter((c) => !!c.url && !!c.title),
      SELECTORS.LISTING,
    );
  }

  private async extractArticle(card: NewsCard): Promise<RawCrawlInsert | null> {
    this.logger.info(`Extraindo artigo: ${card.title}`);

    try {
      await navigateTo(this.page, card.url, WaitStrategy.DOM_CONTENT_LOADED);
      const fullText = await this.getArticleText(this.page, card.excerpt);
      return this.buildRawCrawl(card, fullText);
    } catch (error) {
      this.logger.error(`Erro ao extrair artigo: ${card.url}`, { error });
      return this.buildRawCrawl(card, card.excerpt);
    }
  }

  private async getArticleText(page: Page, fallback: string): Promise<string> {
    if (await elementExists(page, SELECTORS.ARTICLE.BODY)) {
      const text = await getInnerText(page, SELECTORS.ARTICLE.BODY);
      if (text.trim().length > 100) return text.trim();
    }

    for (const selector of SELECTORS.ARTICLE.FALLBACKS) {
      if (!(await elementExists(page, selector))) continue;

      const paragraphs = await getTexts(page, `${selector} p`);
      const joined = paragraphs.join('\n').trim();
      if (joined.length > 100) return joined;

      const single = await getInnerText(page, selector);
      if (single.trim().length > 100) return single.trim();
    }

    return fallback;
  }

  private buildRawCrawl(card: NewsCard, body: string): RawCrawlInsert {
    const categoryPrefix = card.category ? `[${card.category}]\n\n` : '';

    return {
      site: SITE.name,
      municipality: SITE.municipality,
      url: card.url,
      title: card.title,
      rawText: `${card.title}\n\n${card.date}\n\n${categoryPrefix}${body}`,
      publishedAt: card.date,
      crawledAt: new Date(),
      processed: false,
    };
  }

  private async getNextPageUrl(page: Page): Promise<string> {
    if (!(await elementExists(page, SELECTORS.LISTING.NEXT_PAGE))) return '';

    const href = await page.getAttribute(SELECTORS.LISTING.NEXT_PAGE, 'href');
    if (!href) return '';

    return new URL(href, SITE.baseUrl).toString();
  }
}
