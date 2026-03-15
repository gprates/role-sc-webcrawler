import { LaunchOptions } from 'playwright';

export const getFirefoxLaunchOptions = (): LaunchOptions => ({
  headless: process.env.HEADLESS !== 'false',
  slowMo: Number(process.env.SLOW_MO) || 0,
  firefoxUserPrefs: {
    'dom.webdriver.enabled': false,
    'general.platform.override': 'Win32',
  },
});

export const DEFAULT_PAGE_TIMEOUT_MS = 30000;
export const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
