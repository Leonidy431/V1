import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://leonidy431.github.io/v1',
  base: '/v1',
  output: 'static',
  vite: {
    ssr: {
      external: ['fs', 'path']
    }
  },
  // Optimize for GitHub Pages
  integrations: [],
  // Use hash routing for compatibility with GitHub Pages
  trailingSlash: 'never'
});
