/**
 * Dependency-free reduction of Gothab's pre-fix repo "malicious content" banner,
 * the exact shape that threw a hydration mismatch for a logged-in viewer.
 *
 * The structural ingredients, all preserved here:
 *   - a render-prop `<Show when={...}>{(_) => <Alert .../>}</Show>` wrapper
 *   - `splitProps(...)` with a `{...rest}` spread onto the keyed root element
 *   - a `<Switch>`/`<Match>` icon block (static element per branch)
 *   - a content wrapper `<div>` holding *dynamic inserts* ({title}, {body()})
 *   - a trailing `<Show when={dismissible}>`-gated <button> SIBLING
 *
 * `dismissible` is true (the logged-in case): the trailing button is the keyed
 * sibling whose hydration key drifts when the content wrapper is keyed
 * asymmetrically between the SSR and DOM backends.
 *
 * Default export is a zero-arg component (the diff harness contract).
 */
import { children, type JSX, Match, Show, splitProps, Switch } from "solid-js";

interface AlertProps {
  title?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  class?: string;
  children?: JSX.Element;
  [key: string]: unknown;
}

function Alert(props: AlertProps) {
  const [local, rest] = splitProps(props, [
    "children",
    "class",
    "title",
    "dismissible",
    "onDismiss",
  ]);
  const body = children(() => local.children);

  return (
    <div class={`alert ${local.class ?? ""}`} role="alert" {...rest}>
      <Switch fallback={<span class="icon">i</span>}>
        <Match when={local.dismissible}>
          <span class="icon">!</span>
        </Match>
      </Switch>

      <div class="content">
        <div class="title">{local.title}</div>
        <div class="desc">{body()}</div>
      </div>

      <Show when={local.dismissible}>
        <button type="button" onClick={local.onDismiss} aria-label="Dismiss">
          x
        </button>
      </Show>
    </div>
  );
}

export default function Banner() {
  const show = () => true;
  return (
    <Show when={show()}>
      {(_) => (
        <Alert
          title="Malicious content detected"
          dismissible={true}
          onDismiss={() => {}}
          data-banner="repo-scan"
        >
          {"1 file"} <a href="/flagged">View flagged files</a>
        </Alert>
      )}
    </Show>
  );
}
