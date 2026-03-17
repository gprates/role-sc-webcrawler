import { firefox } from 'playwright';
import {
  DEFAULT_PAGE_TIMEOUT_MS,
  DEFAULT_VIEWPORT,
  getFirefoxLaunchOptions,
} from './browser.config';
import type { BrowserContext } from '../types/crawler.types';

const isLambda = (): boolean => !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const createLocalBrowser = async (): Promise<BrowserContext> => {
  const browser = await firefox.launch(getFirefoxLaunchOptions());
  const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_PAGE_TIMEOUT_MS);
  return { browser, page };
};

const createLambdaBrowser = async (): Promise<BrowserContext> => {
  const chromium = await import('@sparticuz/chromium');
  const { chromium: playwrightChromium } = await import('playwright-core');

  const executablePath = await chromium.default.executablePath();
  const browser = await playwrightChromium.launch({
    args: chromium.default.args,
    executablePath,
    headless: true,
  });
  const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_PAGE_TIMEOUT_MS);
  return { browser, page };
};

export const BrowserFactory = {
  create: async (): Promise<BrowserContext> => {
    return isLambda() ? createLambdaBrowser() : createLocalBrowser();
  },

  close: async (ctx: BrowserContext): Promise<void> => {
    await ctx.browser.close();
  },
};
