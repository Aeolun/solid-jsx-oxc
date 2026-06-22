// A nested element that carries its OWN spread must STAY keyed (its own
// ssrElement → getNextElement on the client). Guards against over-correcting
// the nested fix into eliding keys that are genuinely needed.
export default function P03() {
  const rest = { id: "outer" };
  const inner = { "data-inner": "1" };
  const x = () => "v";
  return (
    <div {...rest}>
      <span {...inner}>{x()}</span>
      <button type="button">go</button>
    </div>
  );
}
