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
  date: string;
  excerpt: string;
  imageCandidates: string[];
}

export interface BombinhasData {
  items: RawCrawlInsert[];
  totalPages: number;
  crawledPages: number;
}

const SELECTORS = {
  LISTING: {
    CARD: 'a[class*="_NoticeButtonPage"]',
    TITLE: 'h2',
    DATE: 'span.text-xs',
    EXCERPT: 'p',
    IMAGE: 'img',
  },
  ARTICLE: {
    BODY: '#textSpeak',
  },
} as const;

const SITE = SITES.BOMBINHAS;

export class BombinhasCrawler extends BaseCrawler<BombinhasData> {
  // Bombinhas usa botao "Veja mais" (load-more via JS), nao paginacao tradicional.
  // Estrategia: pegar apenas a primeira pagina, suficiente para capturar
  // todas as noticias publicadas dentro de uma janela de tempo razoavel.
  constructor(_maxPages: number = 1) {
    super(SITE);
  }

  protected async navigate(): Promise<void> {
    await navigateTo(this.page, SITE.listingUrl, WaitStrategy.NETWORK_IDLE);
    await this.page.waitForSelector(SELECTORS.LISTING.CARD);
  }

  protected async extract(): Promise<BombinhasData> {
    const items: RawCrawlInsert[] = [];

    this.logger.info(`Crawling pagina unica: ${SITE.listingUrl}`);

    const cards = await this.extractCards(this.page);
    this.logger.info(`Encontrados ${cards.length} cards`);

    for (const card of cards) {
      const rawCrawl = await this.extractArticle(card);
      if (rawCrawl) items.push(rawCrawl);
    }

    return { items, totalPages: 1, crawledPages: 1 };
  }

  private async extractCards(page: Page): Promise<NewsCard[]> {
    return page.$$eval(
      SELECTORS.LISTING.CARD,
      (anchors, baseUrl) =>
        anchors
          .map((anchor) => {
            const href = anchor.getAttribute('href') ?? '';
            const url = href ? new URL(href, baseUrl).toString() : '';
            const title = anchor.querySelector('h2')?.textContent?.trim() ?? '';
            const date = anchor.querySelector('span.text-xs')?.textContent?.trim() ?? '';
            const excerpt = anchor.querySelector('p')?.textContent?.trim() ?? '';

            const img = anchor.querySelector('img');
            const imageCandidates = img
              ? [img.getAttribute('src'), img.getAttribute('data-src'), img.getAttribute('srcset')].filter(
                  (v): v is string => !!v,
                )
              : [];

            return { url, title, date, excerpt, imageCandidates };
          })
          .filter((c) => !!c.url && !!c.title),
      SITE.baseUrl,
    );
  }

  private async extractArticle(card: NewsCard): Promise<RawCrawlInsert | null> {
    this.logger.info(`Extraindo artigo: ${card.title}`);

    try {
      await navigateTo(this.page, card.url, WaitStrategy.NETWORK_IDLE);
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
}
