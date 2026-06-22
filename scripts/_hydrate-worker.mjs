/**
 * Hydration phase of the differential. MUST be run under browser+development
 * conditions:
 *
 *   node --conditions=browser --conditions=development _hydrate-worker.mjs ...
 *
 * so bare `solid-js` resolves to the client dev core (`isServer === false`) and
 * `hydrate()` walks the SSR DOM via `getNextElement`, throwing
 * "Hydration Mismatch. Unable to find DOM nodes for hydration key: …" on drift.
 *
 * argv[2] = file:// URL of the DOM-compiled fixture module (default export = component)
 * argv[3] = file:// URL of solid-js/web's client dev build (dist/dev.js)
 * argv[4] = path to a file containing the SSR HTML to hydrate against
 * argv[5] = file:// URL of the happy-dom entry (resolved by the orchestrator)
 *
 * Prints a single JSON line: { ok } or { ok:false, error }.
 */
import { readFileSync } from "node:fs";

const [, , moduleUrl, webUrl, htmlPath, happyDomUrl] = process.argv;

async function main() {
  const html = readFileSync(htmlPath, "utf8");

  // Minimal DOM via happy-dom (path supplied by the orchestrator since this
  // worker lives outside the gothab frontend's node_modules tree).
  const { Window } = await import(happyDomUrl);
  const win = new Window({ url: "https://example.test/" });
  const doc = win.document;
  // Expose the globals the solid client build reaches for.
  const define = (k, v) => {
    try {
      Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
    } catch {
      /* getter-only global (e.g. navigator on newer node) — skip */
    }
  };
  for (const k of [
    "Node",
    "Element",
    "HTMLElement",
    "SVGElement",
    "Text",
    "Comment",
    "DocumentFragment",
    "Event",
    "CustomEvent",
    "HTMLTemplateElement",
    "navigator",
  ]) {
    if (k in win) define(k, win[k]);
  }
  define("window", win);
  define("document", doc);

  // Hydration registry globals the client build reads.
  globalThis._$HY = { events: [], completed: new WeakSet(), r: {}, done: false };

  const container = doc.createElement("div");
  container.innerHTML = html;
  doc.body.appendChild(container);

  const web = await import(webUrl);
  const mod = await import(moduleUrl);
  const Comp = mod.default;
  if (typeof Comp !== "function") {
    return { ok: false, error: "fixture default export is not a component function" };
  }

  let thrown = null;
  // The dev runtime throws synchronously inside hydrate() on key drift. Capture
  // both the throw and any async error surfaced on window.
  win.addEventListener?.("error", (e) => {
    if (!thrown) thrown = e?.error || e?.message || String(e);
  });
  try {
    web.hydrate(() => web.createComponent(Comp, {}), container, { renderId: "" });
  } catch (e) {
    thrown = e;
  }

  if (thrown) {
    const msg = thrown?.message || String(thrown);
    return { ok: false, error: msg, finalHtml: container.innerHTML };
  }
  return { ok: true, finalHtml: container.innerHTML };
}

main()
  .then((r) => process.stdout.write(JSON.stringify(r)))
  .catch((e) => process.stdout.write(JSON.stringify({ ok: false, error: `${e?.stack || e}` })));
