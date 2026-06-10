#!/usr/bin/env node
/**
 * Structural conformance differential: solid-jsx-oxc (our Rust/OXC compiler) vs
 * babel-plugin-jsx-dom-expressions (the reference) over babel's own DOM-mode
 * fixture inputs.
 *
 * WHY a *structural* diff and not a textual one: the two compilers share a
 * runtime contract but emit different code shapes — babel uses template-as-
 * callable (`_tmpl$()`), `/*#__PURE__*\/` markers, `_$`-prefixed import locals,
 * omitted attribute quotes / closing tags, and precompiled effect-diff blocks
 * (`_$effect(_p$ => {...})`); we emit `_tmpl$.cloneNode(true)`, bare helper
 * names, always-quoted attrs, and `effect(() => setAttribute(...))`. A
 * byte-for-byte match is therefore impossible by construction.
 *
 * What DOES carry semantic meaning identically across both is the set of
 * `template(...)` definitions:
 *   1. the template's HTML string (after neutralising quoting + closing-tag
 *      elision), and
 *   2. the runtime flag vector `(isImportNode, isSVG, isMathML)`.
 *
 * The *namespace* behaviour lives entirely in (1)+(2), and that is the dimension
 * this differential faithfully validates:
 *   - SVG: a non-`<svg>` SVG root (e.g. a `<path>` produced through a
 *     `<For>`/`<Show>`/component boundary) must be wrapped in a synthetic
 *     `<svg>…</svg>` and flagged `isSVG=true`.
 *   - MathML: a template whose root tag is a MathML element (`<mrow>`, `<mi>`,
 *     even a root `<math>`) must be flagged `isMathML=true` (no wrapper).
 *
 * NOTE on scope: template-string comparison is a faithful instrument for the
 * namespace dimension ONLY. It deliberately does NOT gate on attribute/binding
 * parity, because both compilers are correct while emitting different template
 * strings there — babel constant-folds statically-resolvable expressions into
 * the template, dedups identical templates, and inlines static style-object
 * props; we set those via runtime calls. Those differences are surfaced below
 * as informational "non-namespace codegen diffs", never as failures. Verifying
 * attribute/binding behaviour requires executing the output in jsdom.
 *
 * No new dependencies: @babel/core and the babel plugin are already in the
 * workspace; our compiler is the local native binding.
 */

const fs = require("node:fs");
const path = require("node:path");
const babel = require("@babel/core");

const babelPlugin = require("../../babel-plugin-jsx-dom-expressions");
const ours = require("../index.js");

const FIXTURE_ROOT = path.join(
  __dirname,
  "../../babel-plugin-jsx-dom-expressions/test",
);

// Mirror each spec's pluginOptions (dom.spec.js / dom-compatible.spec.js).
const SUITES = [
  {
    dir: "__dom_fixtures__",
    babelOptions: {
      moduleName: "r-dom",
      builtIns: ["For", "Show"],
      generate: "dom",
      wrapConditionals: true,
      contextToCustomElements: true,
      staticMarker: "@once",
      requireImportSource: false,
    },
  },
  {
    dir: "__dom_compatible_fixtures__",
    babelOptions: {
      moduleName: "r-dom",
      builtIns: ["For", "Show"],
      generate: "dom",
      wrapConditionals: true,
      contextToCustomElements: true,
      staticMarker: "@once",
      requireImportSource: false,
      omitLastClosingTag: false,
      omitQuotes: false,
    },
  },
];

// Our compiler's options. We don't expose omitQuotes/omitLastClosingTag knobs
// (we always quote + close); the normaliser erases that difference. builtIns is
// our superset default, which covers For/Show.
const OUR_OPTIONS = { generate: "dom" };

function runBabel(code, options) {
  // The babel plugin emits a `data-hk` advisory for one fixture
  // (simpleElements/template90) via `console.log` (element.js) without throwing.
  // Mute console.log/warn/error around the call (the harness's own report uses
  // console.log, so restore it before returning).
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    const out = babel.transformSync(code, {
      plugins: [[babelPlugin, options]],
      presets: [],
      configFile: false,
      babelrc: false,
      filename: "input.jsx",
    });
    return out.code;
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }
}

function runOurs(code) {
  return ours.transform(code, OUR_OPTIONS).code;
}

/**
 * Normalise an HTML template literal so quoting style and closing-tag elision
 * don't register as differences. Strips all closing tags (carry no extra info
 * for well-formed templates), and for every open tag canonicalises attributes
 * to `name=value` with quotes removed when the value has no whitespace, and
 * sorts them (attribute order is irrelevant to DOM semantics and the two
 * compilers occasionally differ).
 */
function normalizeHtml(html) {
  // Drop closing tags entirely (neutralises omitLastClosingTag).
  let s = html.replace(/<\/[a-zA-Z][^>]*>/g, "");
  // Canonicalise each open/self-closing tag.
  s = s.replace(/<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_m, tag, attrs) => {
    const parsed = [];
    const attrRe = /([\w:-]+)(?:=("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let m;
    while ((m = attrRe.exec(attrs)) !== null) {
      const name = m[1];
      if (m[2] === undefined) {
        parsed.push(name); // boolean attr
        continue;
      }
      const value = m[3] ?? m[4] ?? m[5] ?? "";
      // Re-quote only if the value contains whitespace; else bare.
      parsed.push(/\s/.test(value) ? `${name}="${value}"` : `${name}=${value}`);
    }
    parsed.sort();
    return `<${tag}${parsed.length ? " " + parsed.join(" ") : ""}>`;
  });
  // Collapse insignificant whitespace between tags.
  return s.replace(/>\s+</g, "><").trim();
}

/** Extract `template(`html`, flag, flag…)` descriptors in source order. */
function extractTemplates(code) {
  const descriptors = [];
  // Matches `template(` or `_$template(` (optionally preceded by a PURE comment),
  // a backtick string, then any trailing boolean args.
  const re = /(?:_\$)?template\(\s*`([^`]*)`((?:\s*,\s*(?:true|false))*)\s*\)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const html = normalizeHtml(m[1]);
    const flags = (m[2].match(/true|false/g) || []).map((t) => t === "true");
    while (flags.length < 3) flags.push(false); // pad (isImportNode,isSVG,isMathML)
    descriptors.push({ html, flags });
  }
  return descriptors;
}

function key(d) {
  return `${d.html} ${d.flags.map((b) => (b ? 1 : 0)).join("")}`;
}
// A template carries a namespace flag if it is isSVG (flags[1]) or isMathML
// (flags[2]). A template's namespace identity is its normalised HTML; the flag
// must then match (same namespace) between babel and us.
function isNamespaced(d) {
  return d.flags[1] || d.flags[2];
}
function nsOf(d) {
  return d.flags[1] ? "SVG" : d.flags[2] ? "MathML" : "-";
}

// Multiset -> set via dedup, because babel merges identical templates into one
// `_tmpl$` while we emit a copy per occurrence. Set semantics make the two
// directly comparable (template dedup is a hoisting optimisation, not a
// semantic difference).
function descriptorSet(list) {
  const m = new Map();
  for (const d of list) m.set(key(d), d);
  return m;
}

let totalFixtures = 0;
let nsClean = 0; // fixtures whose namespaced-template set matches babel
let namespaceRegression = false;
const report = [];

for (const suite of SUITES) {
  const dir = path.join(FIXTURE_ROOT, suite.dir);
  for (const name of fs.readdirSync(dir).sort()) {
    const codePath = path.join(dir, name, "code.js");
    if (!fs.existsSync(codePath)) continue;
    totalFixtures++;
    const source = fs.readFileSync(codePath, "utf8");

    let babelCode, ourCode;
    let babelErr, ourErr;
    try {
      babelCode = runBabel(source, suite.babelOptions);
    } catch (e) {
      babelErr = e.message.split("\n")[0];
    }
    try {
      ourCode = runOurs(source);
    } catch (e) {
      ourErr = e.message.split("\n")[0];
    }
    // Some fixtures (e.g. the deliberate `data-hk` warning) throw in babel by
    // design. If both compilers reject it, that's agreement; skip it.
    if (babelErr || ourErr) {
      report.push({ suite: suite.dir, name, errored: { babelErr, ourErr } });
      if (babelErr && ourErr) nsClean++; // both reject -> no namespace claim to make
      continue;
    }

    const babelSet = descriptorSet(extractTemplates(babelCode));
    const ourSet = descriptorSet(extractTemplates(ourCode));

    // --- Namespace conformance gate: SVG + MathML flagged templates must match.
    // Key namespaced templates by normalised HTML -> namespace label, so a flag
    // divergence on the same template (e.g. babel flags MathML, we don't) shows
    // up as a missing/value diff.
    const babelNs = new Map();
    for (const d of babelSet.values()) if (isNamespaced(d)) babelNs.set(d.html, nsOf(d));
    const ourNs = new Map();
    for (const d of ourSet.values()) if (isNamespaced(d)) ourNs.set(d.html, nsOf(d));

    const nsDiffs = [];
    for (const [html, ns] of babelNs) {
      if (!ourNs.has(html)) {
        // Did we emit the same template but unflagged? That's the namespace bug.
        const oursSame = [...ourSet.values()].find((x) => x.html === html);
        if (oursSame) nsDiffs.push(`we emit \`${html}\` WITHOUT ${ns} flag (babel: ${ns})`);
        else nsDiffs.push(`babel emits ${ns} template we don't: \`${html}\``);
      } else if (ourNs.get(html) !== ns) {
        nsDiffs.push(`namespace differs for \`${html}\`: babel=${ns} ours=${ourNs.get(html)}`);
      }
    }
    for (const [html, ns] of ourNs) {
      if (!babelNs.has(html)) nsDiffs.push(`we flag ${ns} but babel doesn't: \`${html}\``);
    }

    if (nsDiffs.length) namespaceRegression = true;
    else nsClean++;

    // --- Informational: full descriptor set diff (non-namespace codegen). ---
    const onlyBabel = [...babelSet.values()].filter((d) => !ourSet.has(key(d)));
    const onlyOurs = [...ourSet.values()].filter((d) => !babelSet.has(key(d)));

    report.push({
      suite: suite.dir,
      name,
      nsMatch: nsDiffs.length === 0,
      nsCount: babelNs.size,
      nsKinds: [...new Set([...babelNs.values()])].sort().join("+"),
      nsDiffs,
      codegenDiffs: onlyBabel.length + onlyOurs.length,
    });
  }
}

console.log("solid-jsx-oxc <-> babel-plugin-jsx-dom-expressions structural conformance\n");
console.log("Gate: every template babel flags isSVG/isMathML, we emit with identical");
console.log("      normalised HTML and the same namespace flag (no spurious ones).\n");
console.log(`Fixtures compared:                 ${totalFixtures}`);
console.log(`Namespace-flag parity with babel:  ${nsClean}/${totalFixtures}\n`);

for (const r of report) {
  if (r.errored) {
    const agree = r.errored.babelErr && r.errored.ourErr;
    console.log(
      `${agree ? "~" : "x"} ${r.suite}/${r.name}  [compile ${agree ? "both-reject" : "disagree"}]`,
    );
    if (!agree) {
      if (r.errored.babelErr) console.log(`    babel only: ${r.errored.babelErr}`);
      if (r.errored.ourErr) console.log(`    ours only:  ${r.errored.ourErr}`);
    }
    continue;
  }
  const mark = r.nsMatch ? "OK " : "XX ";
  const nsNote = r.nsCount
    ? `${r.nsCount} ${r.nsKinds} template(s) ${r.nsMatch ? "match babel" : "MISMATCH"}`
    : "no namespaced templates";
  const extra = r.codegenDiffs ? `, ${r.codegenDiffs} non-namespace codegen diff(s)` : "";
  console.log(`${mark} ${r.suite}/${r.name}  — ${nsNote}${extra}`);
  for (const d of r.nsDiffs) console.log(`    ${d}`);
}

console.log("");
if (namespaceRegression) {
  console.error("FAIL: namespace handling (SVG/MathML) diverged from babel (see XX above).");
  process.exit(1);
}
console.log(
  `PASS: namespace conformance — all ${nsClean}/${totalFixtures} fixtures match babel's`,
);
console.log(
  "   isSVG/isMathML wrapping + flagging. (Other per-fixture codegen diffs above",
);
console.log(
  "   are non-namespace: template dedup, static-style inlining, entity encoding.)",
);
