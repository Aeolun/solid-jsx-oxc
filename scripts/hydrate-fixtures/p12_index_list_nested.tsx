// <Index> (signal-per-item) producing nested rows, inside a spread container,
// with a trailing keyed sibling.
import { Index } from "solid-js";
export default function P12() {
  const rest = { role: "list" };
  const items = () => ["x", "y"];
  return (
    <div {...rest}>
      <Index each={items()}>
        {(it) => (
          <div class="row">
            <span>{it()}</span>
          </div>
        )}
      </Index>
      <button type="button">add</button>
    </div>
  );
}
