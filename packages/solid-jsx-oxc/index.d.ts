/**
 * solid-jsx-oxc - OXC-based JSX compiler for SolidJS
 */

export interface TransformOptions {
  /**
   * The module to import runtime helpers from
   * @default "solid-js/web"
   */
  moduleName?: string;

  /**
   * Generate mode: "dom", "ssr", or "universal"
   * @default "dom"
   */
  generate?: 'dom' | 'ssr' | 'universal';

  /**
   * Whether to enable hydration support
   * @default false
   */
  hydratable?: boolean;

  /**
   * Whether to delegate events
   * @default true
   */
  delegateEvents?: boolean;

  /**
   * Whether to wrap conditionals
   * @default true
   */
  wrapConditionals?: boolean;

  /**
   * Whether to pass context to custom elements
   * @default true
   */
  contextToCustomElements?: boolean;

  /**
   * Source filename
   * @default "input.jsx"
   */
  filename?: string;

  /**
   * Whether to generate source maps
   * @default false
   */
  sourceMap?: boolean;

  /**
   * Controls the compile-time hydration slot-order check: `"error"` (fatal,
   * default), `"warn"`, or `"off"`. Only runs when `hydratable` is true.
   * @default "error"
   */
  hydrationOrderCheck?: 'error' | 'warn' | 'off';

  /**
   * Built-in components that receive special handling
   */
  builtIns?: string[];
}

/** A compile-time diagnostic surfaced by the transform. */
export interface Diagnostic {
  /** `"error"` or `"warning"`. */
  severity: 'error' | 'warning' | string;
  /** Human-readable message describing the problem. */
  message: string;
  /** Optional fix-it guidance. */
  help?: string;
  /** 1-based line of the anchor span in the source. */
  line: number;
  /** 1-based column of the anchor span in the source. */
  column: number;
}

export interface TransformResult {
  /** The transformed code */
  code: string;
  /** Source map (if enabled) */
  map?: string;
  /**
   * Compile-time diagnostics (e.g. hydration slot-order hazards). Consumers
   * fail the build on any `severity: "error"` entry.
   */
  diagnostics: Diagnostic[];
}

/**
 * Transform JSX source code
 * @param source - The source code to transform
 * @param options - Transform options
 * @returns The transformed code and optional source map
 */
export function transform(source: string, options?: TransformOptions): TransformResult;

/**
 * Low-level transform function from the native binding.
 */
export function transformJsx(source: string, options?: {
  moduleName?: string;
  generate?: 'dom' | 'ssr' | 'universal' | string;
  hydratable?: boolean;
  delegateEvents?: boolean;
  wrapConditionals?: boolean;
  contextToCustomElements?: boolean;
  filename?: string;
  sourceMap?: boolean;
  hydrationOrderCheck?: 'error' | 'warn' | 'off' | string;
} | null): TransformResult;

export interface PresetResult {
  options: TransformOptions;
  transform: (source: string) => TransformResult;
}

/**
 * Create a preset configuration (for compatibility with babel-preset-solid interface)
 * @param context - Babel context (ignored, for compatibility)
 * @param options - User options
 * @returns Preset configuration with options and transform function
 */
export function preset(context: unknown, options?: TransformOptions): PresetResult;

/**
 * Default options matching babel-preset-solid
 */
export const defaultOptions: Required<Omit<TransformOptions, 'filename'>>;

declare const _default: {
  transform: typeof transform;
  preset: typeof preset;
  defaultOptions: typeof defaultOptions;
  transformJsx: typeof transformJsx;
};

export default _default;
