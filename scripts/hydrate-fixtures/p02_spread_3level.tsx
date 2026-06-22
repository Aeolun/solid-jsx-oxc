// Spread parent + THREE levels of nested static elements with a deep insert,
// then a trailing keyed sibling. Exercises that transform_element_nested
// recurses (grandchildren must also stay keyless).
export default function P02() {
  const rest = { id: "x", "data-k": "v" };
  const x = () => "deep";
  return (
    <div {...rest}>
      <div class="a">
        <div class="b">
          <span>{x()}</span>
        </div>
      </div>
      <button type="button">go</button>
    </div>
  );
}
