import { firefox } from 'playwright';
import {
  DEFAULT_PAGE_TIMEOUT_MS,
  DEFAULT_VIEWPORT,
  getFirefoxLaunchOptions,
} from './browser.config';
import { BrowserContext } from '../types/crawler.types';

export const BrowserFactory = {
  create: async (): Promise<BrowserContext> => {
    const browser = await firefox.launch(getFirefoxLaunchOptions());
    const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
    const page = await context.newPage();
    page.setDefaultTimeout(DEFAULT_PAGE_TIMEOUT_MS);
    return { browser, page };
  },

  close: async (ctx: BrowserContext): Promise<void> => {
    await ctx.browser.close();
  },
};
