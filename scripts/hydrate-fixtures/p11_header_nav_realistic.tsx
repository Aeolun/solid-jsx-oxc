// Realistic header: spread root + several nested static branches (header/h1/p,
// nav/a) + a trailing component AND a trailing keyed button. The kind of
// multi-branch layout where counter drift bites one specific node.
import { Show } from "solid-js";
function A(props: { href: string; children?: unknown }) {
  return <a href={props.href}>{props.children as never}</a>;
}
export default function P11() {
  const rest = { role: "banner" };
  const title = () => "Repo";
  const sub = () => "subtitle";
  const loggedIn = () => true;
  return (
    <section {...rest}>
      <header class="hd">
        <h1 class="t">{title()}</h1>
        <p class="s">{sub()}</p>
      </header>
      <nav class="nv">
        <A href="/">home</A>
        <A href="/issues">issues</A>
      </nav>
      <Show when={loggedIn()}>
        <button type="button" aria-label="settings">
          gear
        </button>
      </Show>
    </section>
  );
}
