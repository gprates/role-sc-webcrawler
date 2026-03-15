import { Browser, Page } from 'playwright';

export interface SiteConfig {
  name: string;
  baseUrl: string;
  listingUrl?: string;
  municipality?: string;
  loginUrl?: string;
}

export interface CrawlerConfig {
  headless?: boolean;
  slowMo?: number;
}

export interface CrawlerResult<T = Record<string, unknown>> {
  site: string;
  url: string;
  data: T;
  crawledAt: Date;
  success: boolean;
  error?: string;
}

export interface BrowserContext {
  browser: Browser;
  page: Page;
}

export interface Credentials {
  username: string;
  password: string;
}
