// A <For> producing nested static elements with inserts — list rows are a
// very common gothab shape (repo lists, nav tabs).
import { For } from "solid-js";
export default function P06() {
  const items = () => ["a", "b", "c"];
  return (
    <ul class="list">
      <For each={items()}>
        {(it) => (
          <li class="row">
            <span class="name">{it}</span>
          </li>
        )}
      </For>
    </ul>
  );
}
