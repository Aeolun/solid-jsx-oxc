// Nested child with DYNAMIC attributes (class/data from signals) under a
// spread parent. Dynamic attrs can flip a nested element onto the ssrElement
// path; verify it still hydrates against the DOM walk.
export default function P08() {
  const rest = { role: "region" };
  const cls = () => "main active";
  const v = () => "42";
  const t = () => "title";
  return (
    <div {...rest}>
      <div class={cls()} data-count={v()}>
        <span>{t()}</span>
      </div>
      <button type="button">go</button>
    </div>
  );
}
