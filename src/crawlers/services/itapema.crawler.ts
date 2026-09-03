import { Page } from 'playwright';
import { BaseCrawler } from '../base/base.crawler';
import { SITES } from '../../config/sites.config';
import { RawCrawlInsert } from '../../types/raw-crawl.types';
import { navigateTo, elementExists, getInnerText, getTexts } from '../../utils/page.utils';
import { WaitStrategy } from '../../enums/wait-strategy.enum';
import { normalizeImageCandidates } from '../../utils/image.utils';

interface NewsCard {
  url: string;
  title: string;
  date: string;
  excerpt: string;
  imageCandidates: string[];
}

export interface ItapemaData {
  items: RawCrawlInsert[];
  totalPages: number;
  crawledPages: number;
}

const SELECTORS = {
  LISTING: {
    CARD: 'article.pmi-search-card',
    TITLE_LINK: '.pmi-search-card__title a',
    DATE: '.pmi-search-card__meta .pmi-date',
    EXCERPT: '.pmi-search-card__excerpt',
    IMAGE: '.pmi-search-card__media img',
    NEXT_PAGE: 'a.next.page-numbers',
  },
  ARTICLE: {
    CONTENT: '.entry-content',
  },
} as const;

const SITE = SITES.ITAPEMA;

export class ItapemaCrawler extends BaseCrawler<ItapemaData> {
  private maxPages: number;

  constructor(maxPages = 5) {
    super(SITE);
    this.maxPages = maxPages;
  }

  protected async navigate(): Promise<void> {
    await navigateTo(this.page, SITE.listingUrl, WaitStrategy.DOM_CONTENT_LOADED);
    await this.page.waitForSelector(SELECTORS.LISTING.CARD);
  }

  protected async extract(): Promise<ItapemaData> {
    const items: RawCrawlInsert[] = [];
    let crawledPages = 0;
    let currentUrl: string = SITE.listingUrl;

    while (currentUrl && crawledPages < this.maxPages) {
      this.logger.info(`Crawling pagina ${crawledPages + 1}: ${currentUrl}`);

      if (crawledPages > 0) {
        await navigateTo(this.page, currentUrl, WaitStrategy.DOM_CONTENT_LOADED);
        await this.page.waitForSelector(SELECTORS.LISTING.CARD);
      }

      const cards = await this.extractCards(this.page);
      this.logger.info(`Encontrados ${cards.length} cards na pagina ${crawledPages + 1}`);

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
          .map((article) => {
            const titleLink = article.querySelector(sel.TITLE_LINK);
            const url = titleLink?.getAttribute('href') ?? '';
            const title = titleLink?.textContent?.trim() ?? '';
            const date = article.querySelector(sel.DATE)?.textContent?.trim() ?? '';
            const excerpt = article.querySelector(sel.EXCERPT)?.textContent?.trim() ?? '';

            const img = article.querySelector(sel.IMAGE);
            const imageCandidates = img
              ? [img.getAttribute('src'), img.getAttribute('data-src'), img.getAttribute('srcset')].filter(
                  (v): v is string => !!v,
                )
              : [];

            return { url, title, date, excerpt, imageCandidates };
          })
          .filter((c) => !!c.url && !!c.title),
      SELECTORS.LISTING,
    );
  }

  private async extractArticle(card: NewsCard): Promise<RawCrawlInsert | null> {
    this.logger.info(`Extraindo artigo: ${card.title}`);

    try {
      await navigateTo(this.page, card.url, WaitStrategy.DOM_CONTENT_LOADED);
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
      const paragraphs = await getTexts(page, `${SELECTORS.ARTICLE.CONTENT} p`);
      const joined = paragraphs.join('\n').trim();
      if (joined.length > 100) return joined;

      const text = await getInnerText(page, SELECTORS.ARTICLE.CONTENT);
      if (text.trim().length > 100) return text.trim();
    }

    return fallback;
  }

  private buildRawCrawl(card: NewsCard, body: string): RawCrawlInsert {
    const imageUrl = normalizeImageCandidates(card.imageCandidates, SITE.baseUrl);

    return {
      site: SITE.name,
      municipality: SITE.municipality,
      url: card.url,
      title: card.title,
      rawText: `${card.title}\n\n${card.date}\n\n${body}`,
      imageUrl,
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
