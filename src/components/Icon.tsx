// Renders an SVG icon as a mask filled with the current text color, so icons
// pick up hover/active colors from CSS like text does.
export default function Icon({ src, size = 24 }: { src: string; size?: number }) {
  return (
    <span
      className="icon"
      aria-hidden
      style={{ width: size, height: size, maskImage: `url("${src}")`, WebkitMaskImage: `url("${src}")` }}
    />
  );
}
