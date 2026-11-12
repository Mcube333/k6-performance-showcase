// Read-heavy shopper journey: open catalogue, look at brands, search a few times.
// This is the traffic shape most e-commerce sites see the most of.

import { group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { getBrands, getProducts, searchProducts } from '../lib/api.js';
import { thinkTime } from '../lib/env.js';
import { buildOptions } from '../config/profiles.js';
import { baseThresholds, endpointThresholds } from '../config/thresholds.js';
import { buildSummary } from '../lib/summary.js';

// Loaded once and shared read-only across all VUs (low memory even at high VU counts)
const searchTerms = new SharedArray('search terms', () => JSON.parse(open('../data/search-terms.json')));

export const options = buildOptions(
  {
    ...baseThresholds,
    ...endpointThresholds({ products: 1500, brands: 1000, search: 1500 }),
  },
  { journey: 'browse-and-search' }
);

export default function () {
  group('01 Landing: catalogue + brands', () => {
    getProducts();
    getBrands();
  });
  sleep(thinkTime());

  group('02 Search', () => {
    const searches = 1 + Math.floor(Math.random() * 3); // 1-3 searches per visit
    for (let i = 0; i < searches; i++) {
      const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];
      searchProducts(term);
      sleep(thinkTime());
    }
  });
}

export function handleSummary(data) {
  return buildSummary(data, 'browse-and-search');
}
