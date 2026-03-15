import { SiteConfig } from '../types/crawler.types';

export const SITES = {
  EXAMPLE: {
    name: 'Example',
    baseUrl: 'https://example.com',
  },
  CAMBORIU: {
    name: 'Camboriú',
    baseUrl: 'https://camboriu.sc.gov.br',
    listingUrl: 'https://camboriu.sc.gov.br/category/noticias/',
    municipality: 'Camboriú',
  },
  ITAJAI_CULTURAL: {
    name: 'Fundação Cultural de Itajaí',
    baseUrl: 'https://fundacaocultural.itajai.sc.gov.br',
    listingUrl: 'https://fundacaocultural.itajai.sc.gov.br/noticias/',
    municipality: 'Itajaí',
  },
} as const satisfies Record<string, SiteConfig>;

export type SiteKey = keyof typeof SITES;
