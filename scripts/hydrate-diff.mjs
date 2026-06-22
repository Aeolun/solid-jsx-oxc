#!/usr/bin/env node
/**
 * SSR↔DOM hydration differential.
 *
 * For each fixture and each compiler (oxc / babel), compile the fixture twice —
 * once with the SSR backend, once with the DOM backend — then:
 *   1. render the SSR output to HTML (server core, isServer=true), and
 *   2. hydrate() the DOM output against that HTML under the client dev runtime
 *      (browser+development conditions, isServer=false), which THROWS on a
 *      hydration-key mismatch.
 *
 * This is the axis the babel-conformance / diff-against-babel / diff-html tools
 * do NOT cover: those all compare oxc-vs-babel for a *fixed* backend. Here we
 * compare the SSR and DOM backends of the *same* compiler against each other —
 * the property that actually has to hold for hydration to work.
 *
 * Running it for babel too tells us whether a failure is upstream
 * (dom-expressions contract → stock Solid has it) or oxc-specific.
 *
 * Usage:
 *   node scripts/hydrate-diff.mjs [fixture ...] [--compiler=oxc|babel|both] [--keep] [--html]
 *   node scripts/hydrate-diff.mjs --all
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, ".."); // solid-jsx-oxc repo root
const FRONTEND = resolve(ROOT, "../gothab/frontend");
const FIXTURE_DIR = join(__dirname, "hydrate-fixtures");

const SOLID_WEB_SERVER = join(FRONTEND, "node_modules/solid-js/web/dist/server.js");
const SOLID_WEB_DEV = join(FRONTEND, "node_modules/solid-js/web/dist/dev.js");
const HAPPY_DOM = join(FRONTEND, "node_modules/happy-dom/lib/index.js");
const TMP = join(FRONTEND, ".hydrate-diff-tmp");

for (const p of [SOLID_WEB_SERVER, SOLID_WEB_DEV, HAPPY_DOM]) {
  if (!existsSync(p)) {
    console.error(`Missing required dependency: ${p}`);
    process.exit(2);
  }
}

// ---------- compilers ----------
const babel = await import(
  join(ROOT, "node_modules/@babel/core/lib/index.js")
).catch(() => import("@babel/core"));
const babelPresetTs = (
  await import(join(ROOT, "node_modules/@babel/preset-typescript/lib/index.js")).catch(() =>
    import("@babel/preset-typescript"),
  )
).default;
const jsxDom = await import(join(ROOT, "packages/babel-plugin-jsx-dom-expressions/index.js"));
const jsxDomPlugin = jsxDom.default ?? jsxDom;

// Up to three transformers, compared side by side per fixture:
//   - babel        : the reference dom-expressions (the hydration oracle)
//   - oxc-local    : this repo's freshly-built .node (includes uncommitted fixes)
//   - oxc-ship     : gothab's installed @aeolun/solid-jsx-oxc (what prod runs)
// A case where `babel` is clean but `oxc-local` throws is a real remaining bug.
const oxcLocalPath = join(ROOT, "packages/solid-jsx-oxc/index.js");
const oxcShipPath = resolve(ROOT, "../gothab/frontend/node_modules/@aeolun/solid-jsx-oxc/index.js");
const oxcLocal = await import(oxcLocalPath);
const oxcShip = existsSync(oxcShipPath) ? await import(oxcShipPath) : null;
console.error(`(oxc-local: ${oxcLocalPath})`);
console.error(`(oxc-ship:  ${oxcShip ? oxcShipPath : "not found — skipped"})`);

const BUILTINS = [
  "For",
  "Show",
  "Switch",
  "Match",
  "Suspense",
  "SuspenseList",
  "Portal",
  "Index",
  "Dynamic",
  "ErrorBoundary",
];

function sharedOptions(generate, moduleUrl) {
  return {
    moduleName: moduleUrl,
    generate,
    hydratable: true,
    contextToCustomElements: true,
    builtIns: BUILTINS,
    wrapConditionals: true,
    delegateEvents: true,
  };
}

function stripTypes(source, filename) {
  return (
    babel.transformSync(source, {
      filename,
      babelrc: false,
      configFile: false,
      presets: [[babelPresetTs, { isTSX: true, allExtensions: true, allowDeclareFields: true }]],
      sourceMaps: false,
    })?.code ?? ""
  );
}

function compileBabel(source, filename, generate, moduleUrl) {
  return (
    babel.transformSync(source, {
      filename,
      babelrc: false,
      configFile: false,
      presets: [[babelPresetTs, { isTSX: true, allExtensions: true, allowDeclareFields: true }]],
      plugins: [[jsxDomPlugin, sharedOptions(generate, moduleUrl)]],
      sourceMaps: false,
    })?.code ?? ""
  );
}

function compileOxcWith(impl, source, filename, generate, moduleUrl) {
  const stripped = stripTypes(source, filename);
  return impl.transform(stripped, { ...sharedOptions(generate, moduleUrl), filename }).code ?? "";
}

const COMPILERS = {
  babel: compileBabel,
  "oxc-local": (s, f, g, m) => compileOxcWith(oxcLocal, s, f, g, m),
  ...(oxcShip ? { "oxc-ship": (s, f, g, m) => compileOxcWith(oxcShip, s, f, g, m) } : {}),
};

// ---------- run one (fixture, compiler) ----------
function runCase(fixturePath, compilerName, opts) {
  const compile = COMPILERS[compilerName];
  const source = readFileSync(fixturePath, "utf8");
  const base = `${fixturePath.split("/").pop().replace(/\W+/g, "_")}.${compilerName}`;

  const serverUrl = pathToFileURL(SOLID_WEB_SERVER).href;
  const devUrl = pathToFileURL(SOLID_WEB_DEV).href;

  let ssrCode;
  let domCode;
  try {
    ssrCode = compile(source, fixturePath, "ssr", serverUrl);
    domCode = compile(source, fixturePath, "dom", devUrl);
  } catch (e) {
    return { compilerName, ok: false, phase: "compile", error: `${e?.message || e}` };
  }

  const ssrPath = join(TMP, `${base}.ssr.mjs`);
  const domPath = join(TMP, `${base}.dom.mjs`);
  const htmlPath = join(TMP, `${base}.html`);
  writeFileSync(ssrPath, ssrCode);
  writeFileSync(domPath, domCode);

  // Phase 1: SSR render (default node conditions → server core).
  const ssr = spawnSync(
    process.execPath,
    [join(__dirname, "_ssr-worker.mjs"), pathToFileURL(ssrPath).href, serverUrl],
    { cwd: FRONTEND, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const ssrOut = parseWorker(ssr, "ssr");
  if (!ssrOut.ok) return { compilerName, ok: false, phase: "ssr", error: ssrOut.error, ssrCode, domCode };
  writeFileSync(htmlPath, ssrOut.html);

  // Phase 2: hydrate (browser+development conditions → client dev core).
  const hyd = spawnSync(
    process.execPath,
    [
      "--conditions=browser",
      "--conditions=development",
      join(__dirname, "_hydrate-worker.mjs"),
      pathToFileURL(domPath).href,
      devUrl,
      htmlPath,
      pathToFileURL(HAPPY_DOM).href,
    ],
    { cwd: FRONTEND, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const hydOut = parseWorker(hyd, "hydrate");

  return {
    compilerName,
    ok: hydOut.ok,
    phase: hydOut.ok ? "done" : "hydrate",
    error: hydOut.error,
    html: ssrOut.html,
    finalHtml: hydOut.finalHtml,
    ssrCode,
    domCode,
  };
}

function parseWorker(proc, label) {
  if (proc.error) return { ok: false, error: `spawn ${label} failed: ${proc.error.message}` };
  const out = (proc.stdout || "").trim();
  if (!out) return { ok: false, error: `${label} produced no output. stderr:\n${proc.stderr}` };
  try {
    return JSON.parse(out);
  } catch {
    return { ok: false, error: `${label} bad JSON: ${out}\nstderr:\n${proc.stderr}` };
  }
}

// ---------- main ----------
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const compilerArg = args.find((a) => a.startsWith("--compiler="))?.split("=")[1];
const compilers = compilerArg ? compilerArg.split(",") : Object.keys(COMPILERS);
const showHtml = flags.has("--html");
const keep = flags.has("--keep");
const positional = args.filter((a) => !a.startsWith("--"));

let fixtures;
if (flags.has("--all") || positional.length === 0) {
  fixtures = readdirSync(FIXTURE_DIR)
    .filter((f) => /\.(tsx|jsx)$/.test(f))
    .sort()
    .map((f) => join(FIXTURE_DIR, f));
} else {
  fixtures = positional.map((p) =>
    existsSync(p) ? resolve(p) : join(FIXTURE_DIR, p.endsWith(".tsx") ? p : `${p}.tsx`),
  );
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const regressions = []; // babel clean but oxc-local broke → real bug to fix before release
const shipOnly = []; // alpha.23 broke but local fixes → confirms fix coverage
for (const fixture of fixtures) {
  const name = fixture.split("/").pop();
  console.log(`\n=== ${name} ===`);
  const res = {};
  for (const compilerName of compilers) {
    const r = runCase(fixture, compilerName, {});
    res[compilerName] = r;
    const status = r.ok ? "OK  " : `FAIL [${r.phase}] ${oneline(r.error)}`;
    console.log(`  ${compilerName.padEnd(9)} ${status}`);
    if (showHtml && r.html) {
      console.log(`    --- SSR HTML (${compilerName}) ---`);
      console.log(r.html.replace(/></g, ">\n<").split("\n").map((l) => `    ${l}`).join("\n"));
    }
  }
  if (res.babel?.ok && res["oxc-local"] && !res["oxc-local"].ok) regressions.push(name);
  if (res["oxc-ship"] && !res["oxc-ship"].ok && res["oxc-local"]?.ok) shipOnly.push(name);
}

if (!keep) rmSync(TMP, { recursive: true, force: true });
else console.log(`\n(kept temp artifacts in ${TMP})`);

console.log(`\n──────── summary ────────`);
console.log(`fixtures: ${fixtures.length}`);
if (shipOnly.length) {
  console.log(`\nfixed by local working-tree (alpha.23 fails → local ok): ${shipOnly.length}`);
  for (const n of shipOnly) console.log(`  + ${n}`);
}
if (regressions.length) {
  console.log(`\n⚠ REMAINING BUGS (babel clean, oxc-local throws): ${regressions.length}`);
  for (const n of regressions) console.log(`  ✗ ${n}`);
  console.log(`\nNOT release-ready — local build still drifts on the above.`);
} else {
  console.log(`\n✓ oxc-local matches babel on every fixture (no SSR↔DOM drift).`);
}
process.exit(regressions.length === 0 ? 0 : 1);

function oneline(s) {
  return String(s || "").split("\n").slice(0, 2).join(" / ");
}
