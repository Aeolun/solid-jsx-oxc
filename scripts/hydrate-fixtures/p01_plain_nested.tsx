// Static nesting with a dynamic insert + trailing keyed sibling, NO spread.
// Baseline: backends should agree without the spread path involved.
export default function P01() {
  const x = () => "hello";
  return (
    <div>
      <div class="a">
        <span class="t">{x()}</span>
      </div>
      <button type="button">go</button>
    </div>
  );
}
