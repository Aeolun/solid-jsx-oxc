/**
 * Build script for Bun + Solid SSR
 * Uses Bun's native bundler with solid-oxc plugin
 */
import solidOxc from '@aeolun/bun-plugin-solid-oxc';

const args = process.argv.slice(2);
const buildClient = args.includes('--client') || args.length === 0;
const buildServer = args.includes('--server') || args.length === 0;

if (buildClient) {
  console.log('Building client bundle...');
  const clientResult = await Bun.build({
    entrypoints: ['./src/entry-client.tsx'],
    outdir: './dist',
    naming: 'client.js',
    target: 'browser',
    minify: process.env.NODE_ENV === 'production',
    sourcemap: process.env.NODE_ENV !== 'production' ? 'linked' : 'none',
    plugins: [
      solidOxc({
        generate: 'dom',
        hydratable: true,
      }),
    ],
  });

  if (!clientResult.success) {
    console.error('Client build failed:');
    for (const log of clientResult.logs) console.error(log);
    process.exit(1);
  }
  console.log('Client build complete!');
}

if (buildServer) {
  console.log('Building server bundle...');
  const serverResult = await Bun.build({
    entrypoints: ['./src/server/index.ts'],
    outdir: './dist',
    naming: 'server.js',
    target: 'bun',
    minify: false,
    sourcemap: 'linked',
    external: ['elysia'], // Keep elysia external for better compat
    plugins: [
      solidOxc({
        generate: 'ssr',
        hydratable: true,
      }),
    ],
  });

  if (!serverResult.success) {
    console.error('Server build failed:');
    for (const log of serverResult.logs) console.error(log);
    process.exit(1);
  }
  console.log('Server build complete!');
}

console.log('Build complete! Run with: bun dist/server.js');
