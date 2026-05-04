/**
 * Bun preload script for Solid JSX transformation
 * Note: This only works with Bun.build(), not runtime module loading
 * For dev, use: bun run build && bun dist/server.js
 */
import { plugin } from 'bun';
import solidOxc from '@aeolun/bun-plugin-solid-oxc';

// Register the plugin for SSR (server-side rendering)
plugin(
  solidOxc({
    generate: 'ssr',
    hydratable: true,
  })
);
