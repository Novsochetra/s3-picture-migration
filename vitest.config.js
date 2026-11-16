import { defineConfig } from 'vitest/config';

const suite = (name) => ({
  extends: true,
  test: { name, include: [`test/${name}/**/*.test.js`] },
});

export default defineConfig({
  test: {
    projects: [suite('unit'), suite('integration'), suite('regression')],
  },
});
