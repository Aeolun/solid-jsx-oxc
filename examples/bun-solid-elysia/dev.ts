/**
 * Dev server with hot rebuild
 * Watches for file changes and rebuilds automatically
 */
import { watch } from 'fs';
import { join } from 'path';
import solidOxc from '@aeolun/bun-plugin-solid-oxc';

const srcDir = join(import.meta.dir, 'src');
let buildPromise: Promise<void> | null = null;
let serverProc: ReturnType<typeof Bun.spawn> | null = null;

async function build() {
  const startTime = performance.now();

  // Build client
  const clientResult = await Bun.build({
    entrypoints: ['./src/entry-client.tsx'],
    outdir: './dist',
    naming: 'client.js',
    target: 'browser',
    sourcemap: 'linked',
    plugins: [
      solidOxc({
        generate: 'dom',
        hydratable: true,
      }),
    ],
  });

  if (!clientResult.success) {
    console.error('\x1b[31m[build] Client build failed:\x1b[0m');
    for (const log of clientResult.logs) console.error(log);
    return false;
  }

  // Build server
  const serverResult = await Bun.build({
    entrypoints: ['./src/server/index.ts'],
    outdir: './dist',
    naming: 'server.js',
    target: 'bun',
    sourcemap: 'linked',
    external: ['elysia'],
    plugins: [
      solidOxc({
        generate: 'ssr',
        hydratable: true,
      }),
    ],
  });

  if (!serverResult.success) {
    console.error('\x1b[31m[build] Server build failed:\x1b[0m');
    for (const log of serverResult.logs) console.error(log);
    return false;
  }

  const elapsed = (performance.now() - startTime).toFixed(0);
  console.log(`\x1b[32m[build] Done in ${elapsed}ms\x1b[0m`);
  return true;
}

async function startServer() {
  if (serverProc) {
    serverProc.kill();
    await serverProc.exited;
  }

  serverProc = Bun.spawn(['bun', 'dist/server.js'], {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: { ...process.env, PORT: process.env.PORT || '3000' },
  });

  console.log(`\x1b[36m[dev] Server started on http://localhost:${process.env.PORT || 3000}\x1b[0m`);
}

async function rebuild() {
  if (buildPromise) return;

  buildPromise = (async () => {
    console.log('\x1b[33m[dev] Rebuilding...\x1b[0m');
    const success = await build();
    if (success) {
      await startServer();
    }
    buildPromise = null;
  })();

  await buildPromise;
}

// Initial build and start
console.log('\x1b[36m[dev] Starting development server...\x1b[0m');
await rebuild();

// Watch for changes
console.log('\x1b[36m[dev] Watching for changes...\x1b[0m');

const watcher = watch(srcDir, { recursive: true }, async (event, filename) => {
  if (filename && (filename.endsWith('.tsx') || filename.endsWith('.ts') || filename.endsWith('.css'))) {
    console.log(`\x1b[33m[dev] ${filename} changed\x1b[0m`);
    await rebuild();
  }
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n\x1b[36m[dev] Shutting down...\x1b[0m');
  watcher.close();
  serverProc?.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  watcher.close();
  serverProc?.kill();
  process.exit(0);
});
