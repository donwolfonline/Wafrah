import { encodeQrMatrix } from "@/lib/qr-matrix";

interface QrCodeProps {
  value: string;
  label: string;
  sizePx?: number;
  className?: string;
}

const QUIET_ZONE_MODULES = 4;

export function QrCode({
  value,
  label,
  sizePx = 176,
  className,
}: QrCodeProps) {
  const { size, modules } = encodeQrMatrix(value);
  const totalViewBox = size + QUIET_ZONE_MODULES * 2;

  return (
    <svg
      role="img"
      aria-label={label}
      width={sizePx}
      height={sizePx}
      viewBox={`0 0 ${totalViewBox} ${totalViewBox}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect
        x={0}
        y={0}
        width={totalViewBox}
        height={totalViewBox}
        fill="#ffffff"
      />
      {modules.map((row, r) =>
        row.map((isDark, c) =>
          isDark ? (
            <rect
              key={`${r}-${c}`}
              x={c + QUIET_ZONE_MODULES}
              y={r + QUIET_ZONE_MODULES}
              width={1}
              height={1}
              fill="#111827"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
