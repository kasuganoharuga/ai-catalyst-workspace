/** Match column width in connection-setup (`md:w-52` ≈ 208px) or labels blur. */
export const ILLUSTRATION_WIDTH = 208;
const H = 130;

export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${ILLUSTRATION_WIDTH} ${H}`}
      role="presentation"
      aria-hidden="true"
      className="h-auto w-full"
    >
      <rect
        x="0.6"
        y="0.6"
        width={ILLUSTRATION_WIDTH - 1.2}
        height={H - 1.2}
        rx="7"
        className="fill-muted stroke-border"
        strokeWidth="1.2"
      />
      {children}
    </svg>
  );
}

export function Label({
  x,
  y,
  children,
  size = 10,
  tone = "foreground",
  weight = 500,
  anchor = "start",
}: {
  x: number;
  y: number;
  children: string;
  size?: number;
  tone?: "foreground" | "muted" | "faint" | "onLime";
  weight?: number;
  anchor?: "start" | "middle";
}) {
  const fill =
    tone === "muted"
      ? "fill-muted-foreground"
      : tone === "faint"
        ? "fill-muted-foreground/45"
        : tone === "onLime"
          ? "fill-brand-lime-foreground"
          : "fill-foreground";
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={weight}
      textAnchor={anchor}
      className={fill}
    >
      {children}
    </text>
  );
}

/** Placeholder for text that does not need to be read. */
export function Bar({
  x,
  y,
  width,
  height = 3.5,
}: {
  x: number;
  y: number;
  width: number;
  height?: number;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={height / 2}
      className="fill-muted-foreground/25"
    />
  );
}

/** Placeholder for a leading icon. */
export function Glyph({
  x,
  y,
  size = 7,
}: {
  x: number;
  y: number;
  size?: number;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={size}
      height={size}
      rx="1.8"
      className="fill-muted-foreground/35"
    />
  );
}
