/**
 * Bun plugin for SolidJS using OXC-based compiler
 *
 * Since both Bun and this plugin use native code, this provides optimal performance.
 *
 * Usage with Bun.build():
 * ```ts
 * import solidPlugin from '@aeolun/bun-plugin-solid-oxc';
 *
 * await Bun.build({
 *   entrypoints: ['./src/index.tsx'],
 *   outdir: './dist',
 *   plugins: [solidPlugin()],
 * });
 * ```
 *
 * Usage with bunfig.toml (runtime):
 * ```toml
 * [bunfig]
 * preload = ["bun-plugin-solid-oxc/register"]
 * ```
 */

import type { BunPlugin } from 'bun';

export interface SolidOxcOptions {
  /**
   * Filter which files to transform (regex pattern)
   * @default /\.[jt]sx$/
   */
  include?: RegExp;

  /**
   * Filter which files to exclude (regex pattern)
   * @default /node_modules/
   */
  exclude?: RegExp;

  /**
   * The module to import runtime helpers from
   * @default 'solid-js/web'
   */
  moduleName?: string;

  /**
   * Generate mode
   * @default 'dom'
   */
  generate?: 'dom' | 'ssr' | 'universal';

  /**
   * Enable hydration support
   * @default false
   */
  hydratable?: boolean;

  /**
   * Delegate events for better performance
   * @default true
   */
  delegateEvents?: boolean;

  /**
   * Wrap conditionals in memos
   * @default true
   */
  wrapConditionals?: boolean;

  /**
   * Pass context to custom elements
   * @default true
   */
  contextToCustomElements?: boolean;

  /**
   * Enable SSR mode
   * @default false
   */
  ssr?: boolean;

  /**
   * Controls the compile-time hydration slot-order check, which catches the
   * `Unable to find DOM nodes for hydration key …` class of bug at build time
   * (element slots resolved through `children()` out of DOM order, or a
   * `children()`-resolved slot mixed with an inline element slot rendered
   * before it). Only runs when `hydratable` is enabled.
   *   - `'error'` (default): throw and fail the build.
   *   - `'warn'`: log a warning but continue.
   *   - `'off'`: disable the check.
   * @default 'error'
   */
  hydrationOrderCheck?: 'error' | 'warn' | 'off';
}

const defaultOptions: SolidOxcOptions = {
  include: /\.[jt]sx$/,
  exclude: /node_modules/,
  moduleName: 'solid-js/web',
  generate: 'dom',
  hydratable: false,
  delegateEvents: true,
  wrapConditionals: true,
  contextToCustomElements: true,
  hydrationOrderCheck: 'error',
};

/**
 * Bun plugin for SolidJS using OXC-based compiler
 */
export default function solidOxc(options: SolidOxcOptions = {}): BunPlugin {
  const opts = { ...defaultOptions, ...options };

  return {
    name: '@aeolun/bun-plugin-solid-oxc',

    async setup(build) {
      // Load the native module once
      const solidJsxOxc = await import('@aeolun/solid-jsx-oxc');

      // Use Bun's onLoad hook with filter
      build.onLoad({ filter: opts.include! }, async (args) => {
        // Skip excluded files
        if (opts.exclude?.test(args.path)) {
          return undefined;
        }

        // Read the source file
        const source = await Bun.file(args.path).text();

        const generate = opts.ssr ? 'ssr' : opts.generate;

        let result: ReturnType<typeof solidJsxOxc.transformJsx>;
        try {
          result = solidJsxOxc.transformJsx(source, {
            filename: args.path,
            moduleName: opts.moduleName,
            generate,
            hydratable: opts.hydratable,
            delegateEvents: opts.delegateEvents,
            wrapConditionals: opts.wrapConditionals,
            contextToCustomElements: opts.contextToCustomElements,
            hydrationOrderCheck: opts.hydrationOrderCheck,
            sourceMap: false, // Bun handles source maps
          });
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          throw new Error(`Failed to transform ${args.path}: ${message}`);
        }

        // Surface compile-time diagnostics (e.g. hydration slot-order hazards).
        // Errors throw and fail the build; warnings are logged.
        for (const d of result.diagnostics ?? []) {
          const help = d.help ? `\n  help: ${d.help}` : '';
          const msg = `${d.message}${help}\n  at ${args.path}:${d.line}:${d.column}`;
          if (d.severity === 'error') {
            throw new Error(msg);
          } else {
            console.warn(msg);
          }
        }

        // Return as 'ts' - JSX is transformed but TypeScript syntax remains
        // Using 'ts' prevents Bun's JSX transform while handling TS syntax
        return {
          contents: result.code,
          loader: 'ts',
        };
      });
    },
  };
}

// Named export for compatibility
export { solidOxc };
