// <Switch>/<Match> whose branches return nested static elements with inserts,
// followed by a keyed sibling.
import { Match, Switch } from "solid-js";
export default function P07() {
  const rest = { role: "status" };
  const kind = () => "b";
  return (
    <div {...rest}>
      <Switch fallback={<span>none</span>}>
        <Match when={kind() === "a"}>
          <div class="a">
            <span>{"A"}</span>
          </div>
        </Match>
        <Match when={kind() === "b"}>
          <div class="b">
            <span>{"B"}</span>
          </div>
        </Match>
      </Switch>
      <button type="button">go</button>
    </div>
  );
}
