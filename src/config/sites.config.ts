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
  BOMBINHAS: {
    name: 'Fundação Municipal de Cultura de Bombinhas',
    baseUrl: 'https://www.culturabombinhas.com.br',
    listingUrl: 'https://www.culturabombinhas.com.br/noticias',
    municipality: 'Bombinhas',
  },
  BALNEARIO_CAMBORIU: {
    name: 'Fundação Cultural de Balneário Camboriú',
    baseUrl: 'https://culturabc.com.br',
    listingUrl: 'https://culturabc.com.br/agenda-cultural/',
    municipality: 'Balneário Camboriú',
  },
} as const satisfies Record<string, SiteConfig>;

export type SiteKey = keyof typeof SITES;
