import { Page } from 'playwright';
import { BaseCrawler } from '../base/base.crawler';
import { SITES } from '../../config/sites.config';
import { RawCrawlInsert } from '../../types/raw-crawl.types';
import { navigateTo } from '../../utils/page.utils';
import { WaitStrategy } from '../../enums/wait-strategy.enum';
import { normalizeImageCandidates } from '../../utils/image.utils';

interface FairItem {
  name: string;
  schedule: string;
  time: string;
  location: string;
  description: string;
}

interface EventCard {
  url: string;
  date: string;
  time: string;
  location: string;
  category: string;
  title: string;
  excerpt: string;
}

export interface BalnearioCamboriuData {
  items: RawCrawlInsert[];
  totalPages: number;
  crawledPages: number;
}

const SITE = SITES.BALNEARIO_CAMBORIU;
const RECURRING_LABEL = 'Evento recorrente';
const DEFAULT_MAX_EVENTS = 15;

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export class BalnearioCamboriuCrawler extends BaseCrawler<BalnearioCamboriuData> {
  private maxEvents: number;

  constructor(maxEvents: number = DEFAULT_MAX_EVENTS) {
    super(SITE);
    this.maxEvents = maxEvents;
  }

  protected async navigate(): Promise<void> {
    await navigateTo(this.page, SITE.listingUrl, WaitStrategy.NETWORK_IDLE);
  }

  protected async extract(): Promise<BalnearioCamboriuData> {
    const items: RawCrawlInsert[] = [];

    this.logger.info('Extraindo feiras (eventos recorrentes)...');
    const fairs = await this.extractFairs(this.page);
    this.logger.info(`Encontradas ${fairs.length} feiras`);

    for (const fair of fairs) {
      items.push(this.buildRawCrawlFromFair(fair));
    }

    this.logger.info('Extraindo eventos da agenda...');
    const eventCards = await this.extractEventCards(this.page);
    const limitedCards = eventCards.slice(0, this.maxEvents);
    this.logger.info(
      `Encontrados ${eventCards.length} eventos, processando ${limitedCards.length}`,
    );

    for (const card of limitedCards) {
      const item = await this.extractEventDetail(card);
      if (item) items.push(item);
    }

    return { items, totalPages: 1, crawledPages: 1 };
  }

  private async extractFairs(page: Page): Promise<FairItem[]> {
    return page.evaluate(() => {
      const labels = Array.from(
        document.querySelectorAll('.elementor-widget-text-editor'),
      );
      const fairsLabels = labels.filter((el) => el.textContent?.trim() === 'Feiras:');

      const result: Array<{
        name: string;
        schedule: string;
        time: string;
        location: string;
        description: string;
      }> = [];

      fairsLabels.forEach((label) => {
        const innerContainer = label.closest('.e-con-full');
        if (!innerContainer) return;
        const parent = innerContainer.closest('.e-con.e-parent');
        if (!parent) return;

        const heading = innerContainer.querySelector('.elementor-widget-heading h2');
        const name = heading?.textContent?.trim() ?? '';
        if (!name) return;

        const textEditors = innerContainer.querySelectorAll(
          '.elementor-widget-text-editor',
        );
        const description = textEditors[1]?.textContent?.trim() ?? '';

        const iconItems = parent.querySelectorAll('.elementor-icon-list-text');
        const schedule = iconItems[0]?.textContent?.trim() ?? '';
        const time = iconItems[1]?.textContent?.trim() ?? '';
        const location = iconItems[2]?.textContent?.trim() ?? '';

        result.push({ name, schedule, time, location, description });
      });

      return result;
    });
  }

  private async extractEventCards(page: Page): Promise<EventCard[]> {
    return page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.jet-listing-grid__item'));
      const result: Array<{
        url: string;
        date: string;
        time: string;
        location: string;
        category: string;
        title: string;
        excerpt: string;
      }> = [];

      items.forEach((item) => {
        const fields = Array.from(
          item.querySelectorAll('.elementor-widget-jet-listing-dynamic-field'),
        );
        const fieldsWithIcons = fields.filter((f) => f.querySelector('i'));
        const fieldsWithoutIcons = fields.filter((f) => !f.querySelector('i'));

        const getContent = (el: Element | undefined): string =>
          el?.querySelector('.jet-listing-dynamic-field__content')?.textContent?.trim() ?? '';

        const date = getContent(fieldsWithIcons[0]);
        const time = getContent(fieldsWithIcons[1]);
        const location = getContent(fieldsWithIcons[2]);
        const category = getContent(fieldsWithoutIcons[0]);
        const title = getContent(fieldsWithoutIcons[1]);
        const excerpt = getContent(fieldsWithoutIcons[2]);

        const links = Array.from(item.querySelectorAll('.jet-listing-dynamic-link a'));
        const readMoreLink = links.find((a) => {
          const href = a.getAttribute('href');
          return href && href.length > 0;
        });
        const url = readMoreLink?.getAttribute('href') ?? '';

        if (url && title) {
          result.push({ url, date, time, location, category, title, excerpt });
        }
      });

      return result;
    });
  }

  private async extractEventDetail(card: EventCard): Promise<RawCrawlInsert | null> {
    this.logger.info(`Extraindo detalhe: ${card.title}`);

    try {
      await navigateTo(this.page, card.url, WaitStrategy.NETWORK_IDLE);
      const fullDescription = await this.getEventDescription(this.page);
      const imageUrl = await this.getEventImage(this.page);
      return this.buildRawCrawlFromEvent(card, fullDescription || card.excerpt, imageUrl);
    } catch (error) {
      this.logger.error(`Erro ao extrair detalhe: ${card.url}`, { error });
      return this.buildRawCrawlFromEvent(card, card.excerpt, null);
    }
  }

  private async getEventDescription(page: Page): Promise<string> {
    return page.evaluate(() => {
      const singlePost = document.querySelector('[data-elementor-type="single-post"]');
      if (!singlePost) return '';

      const fields = Array.from(
        singlePost.querySelectorAll('.elementor-widget-jet-listing-dynamic-field'),
      );
      const fieldsWithoutIcons = fields.filter((f) => !f.querySelector('i'));

      const content = fieldsWithoutIcons[0]?.querySelector(
        '.jet-listing-dynamic-field__content',
      );
      if (!content) return '';

      return (content as HTMLElement).innerText.trim();
    });
  }

  private async getEventImage(page: Page): Promise<string | null> {
    const candidates = await page.evaluate(() => {
      const singlePost = document.querySelector('[data-elementor-type="single-post"]');
      const img = singlePost?.querySelector('.elementor-widget-image img');
      if (!img) return [];

      return [img.getAttribute('src'), img.getAttribute('data-src'), img.getAttribute('srcset')].filter(
        (v): v is string => !!v,
      );
    });

    return normalizeImageCandidates(candidates, SITE.baseUrl);
  }

  private buildRawCrawlFromFair(fair: FairItem): RawCrawlInsert {
    const url = `${SITE.listingUrl}#${slugify(fair.name)}`;

    const rawText = [
      fair.name,
      '',
      RECURRING_LABEL,
      '',
      `Quando: ${fair.schedule}, ${fair.time}`,
      `Onde: ${fair.location}`,
      '',
      fair.description,
    ].join('\n');

    return {
      site: SITE.name,
      municipality: SITE.municipality,
      url,
      title: fair.name,
      rawText,
      imageUrl: null,
      publishedAt: RECURRING_LABEL,
      crawledAt: new Date(),
      processed: false,
    };
  }

  private buildRawCrawlFromEvent(
    card: EventCard,
    description: string,
    imageUrl: string | null,
  ): RawCrawlInsert {
    const categoryLine = card.category ? `${card.category} ` : '';
    const timeLine = card.time ? ` - ${card.time}` : '';

    const rawText = [
      card.title,
      '',
      `${categoryLine}${card.date}${timeLine}`,
      `Local: ${card.location}`,
      '',
      description,
    ].join('\n');

    return {
      site: SITE.name,
      municipality: SITE.municipality,
      url: card.url,
      title: card.title,
      rawText,
      imageUrl,
      publishedAt: card.date,
      crawledAt: new Date(),
      processed: false,
    };
  }
}
