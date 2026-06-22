// A component sibling sandwiched between static siblings inside a spread
// parent — the component consumes a key via createComponent; the static
// siblings must not drift around it.
function Tag(props: { label: string }) {
  return <em class="tag">{props.label}</em>;
}
export default function P04() {
  const rest = { role: "group" };
  return (
    <div {...rest}>
      <span class="lead">lead</span>
      <Tag label="mid" />
      <button type="button">go</button>
    </div>
  );
}
