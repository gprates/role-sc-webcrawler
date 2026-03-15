import { Page } from 'playwright';
import { BrowserFactory } from '../../browser/browser.factory';
import { BrowserContext, CrawlerResult, SiteConfig } from '../../types/crawler.types';
import { createLogger, Logger } from '../../utils/logger.utils';

export abstract class BaseCrawler<T = Record<string, unknown>> {
  protected page!: Page;
  protected readonly logger: Logger;

  private browserContext!: BrowserContext;

  constructor(protected readonly site: SiteConfig) {
    this.logger = createLogger(site.name);
  }

  protected abstract navigate(): Promise<void>;
  protected abstract extract(): Promise<T>;
  protected async beforeNavigate(): Promise<void> {}

  async run(): Promise<CrawlerResult<T>> {
    await this.setup();

    try {
      await this.beforeNavigate();
      await this.navigate();
      const data = await this.extract();
      return this.buildResult(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Crawler falhou', { error: message });
      return this.buildErrorResult(message);
    } finally {
      await this.teardown();
    }
  }

  private async setup(): Promise<void> {
    this.logger.info('Iniciando browser...');
    this.browserContext = await BrowserFactory.create();
    this.page = this.browserContext.page;
    this.logger.info('Browser iniciado');
  }

  private async teardown(): Promise<void> {
    this.logger.info('Fechando browser...');
    await BrowserFactory.close(this.browserContext);
  }

  private buildResult(data: T): CrawlerResult<T> {
    return {
      site: this.site.name,
      url: this.site.baseUrl,
      data,
      crawledAt: new Date(),
      success: true,
    };
  }

  private buildErrorResult(error: string): CrawlerResult<T> {
    return {
      site: this.site.name,
      url: this.site.baseUrl,
      data: {} as T,
      crawledAt: new Date(),
      success: false,
      error,
    };
  }
}
