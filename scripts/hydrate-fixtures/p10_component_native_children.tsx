// A component that receives NATIVE element children containing inserts, and
// renders them via {props.children}. Mirrors @gothab/ui wrappers (Card, etc.).
import type { JSX } from "solid-js";
function Card(props: { children?: JSX.Element }) {
  return (
    <section class="card">
      <div class="card-body">{props.children}</div>
    </section>
  );
}
export default function P10() {
  const x = () => "content";
  return (
    <Card>
      <h3 class="title">Heading</h3>
      <p class="desc">{x()}</p>
      <a href="/more">more</a>
    </Card>
  );
}
