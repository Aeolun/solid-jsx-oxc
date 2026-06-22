/**
 * SSR phase of the hydration differential. Runs under DEFAULT node conditions
 * so bare `solid-js` resolves to the server core (`isServer === true`) and
 * `renderToStringAsync` produces real `data-hk` hydration keys.
 *
 * argv[2] = file:// URL of the SSR-compiled fixture module (default export = component)
 * argv[3] = file:// URL of solid-js/web's server build (dist/server.js)
 *
 * Prints a single JSON line: { ok, html } or { ok:false, error }.
 */
const [, , moduleUrl, webUrl] = process.argv;

async function main() {
  const web = await import(webUrl);
  const mod = await import(moduleUrl);
  const Comp = mod.default;
  if (typeof Comp !== "function") {
    return { ok: false, error: "fixture default export is not a component function" };
  }
  // Mirror real usage: the mount site is `<App/>` === createComponent(App, {}).
  const html = await web.renderToStringAsync(() => web.createComponent(Comp, {}), {
    renderId: "",
  });
  return { ok: true, html };
}

main()
  .then((r) => process.stdout.write(JSON.stringify(r)))
  .catch((e) => process.stdout.write(JSON.stringify({ ok: false, error: `${e?.stack || e}` })));
