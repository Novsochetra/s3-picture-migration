import { noBannerComments } from './rules/no-banner-comments.js';
import { noJsdocBlocks } from './rules/no-jsdoc-blocks.js';

export const localRules = {
  meta: { name: 'local' },
  rules: {
    'no-banner-comments': noBannerComments,
    'no-jsdoc-blocks': noJsdocBlocks,
  },
};
