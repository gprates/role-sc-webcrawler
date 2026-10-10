import { Page } from 'playwright';
import { BaseCrawler } from '../base/base.crawler';
import { SITES } from '../../config/sites.config';
import { RawCrawlInsert } from '../../types/raw-crawl.types';
import { navigateTo, elementExists, getInnerText } from '../../utils/page.utils';
import { WaitStrategy } from '../../enums/wait-strategy.enum';
import { normalizeImageCandidates } from '../../utils/image.utils';

interface NewsCard {
  url: string;
  title: string;
  imageCandidates: string[];
}

interface ArticleDetails {
  date: string;
  body: string;
}

export interface PortoBeloData {
  items: RawCrawlInsert[];
  totalPages: number;
  crawledPages: number;
}

const SELECTORS = {
  LISTING: {
    CARD: '.posts .post-item',
    LINK: 'a.link',
    TITLE: '.post-title',
    IMAGE: 'img.post-img',
  },
  ARTICLE: {
    CONTENT: '.entry-content',
    DATE: 'time.entry-date.published',
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
            const url = article.querySelector(sel.LINK)?.getAttribute('href') ?? '';
            const title = article.querySelector(sel.TITLE)?.textContent?.trim() ?? '';

            const img = article.querySelector(sel.IMAGE);
            const imageCandidates = img
              ? [img.getAttribute('src'), img.getAttribute('data-src'), img.getAttribute('srcset')].filter(
                  (v): v is string => !!v,
                )
              : [];

            return { url, title, imageCandidates };
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
      const details = await this.getArticleDetails(this.page);
      return this.buildRawCrawl(card, details);
    } catch (error) {
      this.logger.error(`Erro ao extrair artigo: ${card.url}`, { error });
      return null;
    }
  }

  private async getArticleDetails(page: Page): Promise<ArticleDetails> {
    // A primeira data publicada e a do artigo; as seguintes sao de posts relacionados
    const date = (await page.getAttribute(SELECTORS.ARTICLE.DATE, 'datetime')) ?? '';
    const body = (await elementExists(page, SELECTORS.ARTICLE.CONTENT))
      ? (await getInnerText(page, SELECTORS.ARTICLE.CONTENT)).trim()
      : '';

    return { date, body };
  }

  private buildRawCrawl(card: NewsCard, { date, body }: ArticleDetails): RawCrawlInsert {
    const imageUrl = normalizeImageCandidates(card.imageCandidates, SITE.baseUrl);

    return {
      site: SITE.name,
      municipality: SITE.municipality,
      url: card.url,
      title: card.title,
      rawText: `${card.title}\n\n${date}\n\n${body}`,
      imageUrl,
      publishedAt: date,
      crawledAt: new Date(),
      processed: false,
    };
  }
}
