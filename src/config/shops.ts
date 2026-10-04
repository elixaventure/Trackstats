/**
 * Where "Get parts" sends riders.
 *
 * Until a shop deal or affiliate programme is live, it opens a plain web
 * shopping search and TrackStats earns nothing. To switch on a partner shop, set
 * PARTNER_SHOP to their search URL with the affiliate tag in it, e.g.
 *
 *   export const PARTNER_SHOP: PartsShop | null = {
 *     name: "Example MX",
 *     searchUrl: (q) => `https://www.example-mx.co.uk/search?q=${encodeURIComponent(q)}&aff=TRACKSTATS`,
 *     affiliate: true,
 *   };
 *
 * Affiliate links must be labelled (UK CAP code / ASA): the button shows a
 * disclosure whenever `affiliate` is true.
 */
export interface PartsShop {
  name: string;
  searchUrl: (query: string) => string;
  affiliate: boolean;
}

export const PARTNER_SHOP: PartsShop | null = null;

const WEB_SEARCH: PartsShop = {
  name: "the web",
  searchUrl: (q) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`,
  affiliate: false,
};

export const partsShop = (): PartsShop => PARTNER_SHOP ?? WEB_SEARCH;
