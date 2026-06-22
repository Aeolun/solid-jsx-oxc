// A <Show>-gated child followed by a keyed sibling inside a spread parent —
// the canonical drift trigger (conditional subtree advances the counter
// differently than a static one).
import { Show } from "solid-js";
export default function P05() {
  const rest = { role: "alert" };
  const cond = () => true;
  return (
    <div {...rest}>
      <div class="body">
        <span>{"text"}</span>
      </div>
      <Show when={cond()}>
        <button type="button" aria-label="x">
          x
        </button>
      </Show>
    </div>
  );
}
