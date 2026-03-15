import { Page } from 'playwright';
import { WaitStrategy } from '../enums/wait-strategy.enum';

type GotoWaitUntil = 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
type LoadStateWaitUntil = 'load' | 'domcontentloaded' | 'networkidle';

export const navigateTo = async (
  page: Page,
  url: string,
  waitStrategy: WaitStrategy = WaitStrategy.DOM_CONTENT_LOADED,
): Promise<void> => {
  await page.goto(url, { waitUntil: waitStrategy as GotoWaitUntil });
};

export const clickAndWait = async (
  page: Page,
  selector: string,
  waitStrategy: WaitStrategy = WaitStrategy.DOM_CONTENT_LOADED,
): Promise<void> => {
  await page.click(selector);
  await page.waitForLoadState(waitStrategy as LoadStateWaitUntil);
};

export const fillInput = async (
  page: Page,
  selector: string,
  value: string,
): Promise<void> => {
  await page.fill(selector, value);
};

export const getText = async (page: Page, selector: string): Promise<string> => {
  const element = await page.waitForSelector(selector);
  return (await element.textContent()) ?? '';
};

export const getInnerText = async (page: Page, selector: string): Promise<string> => {
  const element = await page.waitForSelector(selector);
  return (await element.innerText()) ?? '';
};

export const getTexts = async (page: Page, selector: string): Promise<string[]> => {
  return page.$$eval(selector, (elements) =>
    elements.map((el) => el.textContent?.trim() ?? ''),
  );
};

export const getAttribute = async (
  page: Page,
  selector: string,
  attribute: string,
): Promise<string> => {
  const value = await page.getAttribute(selector, attribute);
  return value ?? '';
};

export const waitForSelector = async (page: Page, selector: string): Promise<void> => {
  await page.waitForSelector(selector);
};

export const elementExists = async (page: Page, selector: string): Promise<boolean> => {
  const element = await page.$(selector);
  return element !== null;
};

export const scrollToBottom = async (page: Page): Promise<void> => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
};
