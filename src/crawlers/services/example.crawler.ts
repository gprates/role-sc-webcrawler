import { BaseCrawler } from '../base/base.crawler';
import { SITES } from '../../config/sites.config';
import { navigateTo, getText, getTexts } from '../../utils/page.utils';
import { WaitStrategy } from '../../enums/wait-strategy.enum';

interface ExampleData {
  title: string;
  paragraphs: string[];
}

export class ExampleCrawler extends BaseCrawler<ExampleData> {
  constructor() {
    super(SITES.EXAMPLE);
  }

  protected async navigate(): Promise<void> {
    await navigateTo(this.page, this.site.baseUrl, WaitStrategy.DOM_CONTENT_LOADED);
  }

  protected async extract(): Promise<ExampleData> {
    const title = await getText(this.page, 'h1');
    const paragraphs = await getTexts(this.page, 'p');
    return { title, paragraphs };
  }
}
