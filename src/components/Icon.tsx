// Renders an SVG icon as a mask filled with the current text color, so icons
// pick up hover/active colors from CSS like text does.
//
// By default every painted pixel shows. Icons that use white shapes as gaps
// (e.g. white outlines separating overlapping parts) are stored with colors
// inverted on a black background and drawn with `luminance`: white shows,
// black is hidden.
export default function Icon({
  src,
  size = 24,
  luminance = false,
}: {
  src: string;
  size?: number;
  luminance?: boolean;
}) {
  return (
    <span
      className="icon"
      aria-hidden
      style={{
        width: size,
        height: size,
        maskImage: `url("${src}")`,
        WebkitMaskImage: `url("${src}")`,
        maskMode: luminance ? 'luminance' : 'alpha',
      }}
    />
  );
}
