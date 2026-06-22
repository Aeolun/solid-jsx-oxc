/**
 * Faithful reproduction of Gothab's pre-fix repo malicious-content banner —
 * the version that actually threw a hydration mismatch for a logged-in viewer.
 *
 * Differences from the minimal `banner.tsx` (which hydrates clean), each a
 * candidate trigger preserved here:
 *   - the variant icon is a COMPONENT (`<Ico/>`, standing in for a phosphor
 *     icon), selected through `<Switch>`/`<Match>` — not a plain inline element
 *   - `props.icon` is split out and resolved via `children()` (the override path)
 *   - the description children are a MIX of static text + a dynamic insert +
 *     a COMPONENT link (`<A/>`, standing in for @solidjs/router's <A>)
 *   - the Alert sits inside an extra wrapper <div> inside the render-prop <Show>
 *
 * Stand-ins (`Ico`, `A`) are real function components so they consume hydration
 * ids exactly like the originals; only their heavy deps are dropped.
 */
import { children, type JSX, Match, Show, splitProps, Switch } from "solid-js";

function Ico(props: { label?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 256 256" class="icon">
      <title>{props.label ?? "icon"}</title>
      <path d="M128 24a104 104 0 1 0 104 104A104 104 0 0 0 128 24Z" />
    </svg>
  );
}

function A(props: { href: string; children?: JSX.Element }) {
  return <a href={props.href}>{props.children}</a>;
}

interface AlertProps {
  variant?: "info" | "success" | "warning" | "error";
  title?: string;
  icon?: JSX.Element;
  dismissible?: boolean;
  onDismiss?: () => void;
  class?: string;
  children?: JSX.Element;
  [key: string]: unknown;
}

function Alert(props: AlertProps) {
  const [local, variants, rest] = splitProps(
    props,
    ["children", "class", "title", "icon", "dismissible", "onDismiss"],
    ["variant"],
  );
  const body = children(() => local.children);
  const iconOverride = children(() => local.icon);

  return (
    <div class={`alert ${local.class ?? ""}`} role="alert" {...rest}>
      <Switch fallback={<Ico label="info" />}>
        <Match when={local.icon != null}>
          <span class="icon">{iconOverride()}</span>
        </Match>
        <Match when={variants.variant === "success"}>
          <Ico label="success" />
        </Match>
        <Match when={variants.variant === "warning"}>
          <Ico label="warning" />
        </Match>
        <Match when={variants.variant === "error"}>
          <Ico label="error" />
        </Match>
      </Switch>

      <div class="content">
        <div class="title">{local.title}</div>
        <div class="desc">{body()}</div>
      </div>

      <Show when={local.dismissible}>
        <button type="button" onClick={local.onDismiss} aria-label="Dismiss">
          <Ico label="dismiss" />
        </button>
      </Show>
    </div>
  );
}

export default function Banner() {
  const show = () => true;
  const count = () => 1;
  const owner = "aeolun";
  const repo = "gothab";
  return (
    <Show when={show()}>
      {(_) => (
        <div class="scan-banner">
          <Alert variant="error" title="Malicious content detected" dismissible={true} onDismiss={() => {}}>
            The content scanner flagged {count() === 1 ? "1 file" : `${count()} files`} in this
            repository's object store (including git history) as malicious.{" "}
            <A href={`/${owner}/${repo}/flagged`}>View flagged files</A>.
          </Alert>
        </div>
      )}
    </Show>
  );
}
