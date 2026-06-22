// A component returning a fragment (array) of multiple keyed roots with a
// dynamic text between them — exercises top-level multi-root hydration.
export default function P09() {
  const a = () => "first";
  const b = () => "last";
  return (
    <>
      <div class="first">{a()}</div>
      middle
      <div class="last">{b()}</div>
    </>
  );
}
