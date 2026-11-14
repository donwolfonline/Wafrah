import { Prisma, type Shift } from "@prisma/client";
import { toDecimal } from "@/features/insights/math";
import type {
  DashboardReasonRow,
  HeatmapCell,
  RawHeatmapRow,
  RawReasonWasteRow,
} from "./types";

const DASHBOARD_SHIFTS: readonly Shift[] = ["MORNING", "EVENING", "NIGHT"];

export function buildHeatmapMatrix(rows: RawHeatmapRow[]): {
  cells: HeatmapCell[];
  maxCellSar: string;
} {
  const lookup = new Map<
    string,
    { wasteSar: Prisma.Decimal; entryCount: number }
  >();
  let maxSar = new Prisma.Decimal(0);

  for (const row of rows) {
    const key = `${Number(row.weekday)}|${row.shift}`;
    const prev = lookup.get(key);
    const sar = toDecimal(row.wasteSar);
    const nextSar = prev ? prev.wasteSar.add(sar) : sar;
    const nextCount = (prev?.entryCount ?? 0) + Number(row.entryCount);
    lookup.set(key, { wasteSar: nextSar, entryCount: nextCount });
    if (nextSar.gt(maxSar)) {
      maxSar = nextSar;
    }
  }

  const cells: HeatmapCell[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (const shift of DASHBOARD_SHIFTS) {
      const entry = lookup.get(`${weekday}|${shift}`);
      const sar = entry?.wasteSar ?? new Prisma.Decimal(0);
      let intensity: 0 | 1 | 2 | 3 | 4 = 0;

      if (sar.gt(0) && maxSar.gt(0)) {
        const ratio = sar.div(maxSar);
        if (ratio.lte("0.25")) intensity = 1;
        else if (ratio.lte("0.5")) intensity = 2;
        else if (ratio.lte("0.75")) intensity = 3;
        else intensity = 4;
      }

      cells.push({
        weekday,
        shift,
        wasteSar: sar.toDecimalPlaces(2).toString(),
        entryCount: entry?.entryCount ?? 0,
        intensity,
      });
    }
  }

  return {
    cells,
    maxCellSar: maxSar.toDecimalPlaces(2).toString(),
  };
}

export function buildRankedReasons(
  rows: RawReasonWasteRow[],
): DashboardReasonRow[] {
  const totalSar = rows.reduce(
    (sum, r) => sum.add(toDecimal(r.wasteSar)),
    new Prisma.Decimal(0),
  );

  return [...rows]
    .sort((a, b) => {
      const cmp = toDecimal(b.wasteSar).comparedTo(toDecimal(a.wasteSar));
      return cmp !== 0 ? cmp : a.reason.localeCompare(b.reason);
    })
    .map((row) => {
      const cost = toDecimal(row.wasteSar);
      const sharePct = totalSar.gt(0)
        ? cost.div(totalSar).mul(100).toDecimalPlaces(1).toString()
        : "0";
      return {
        reason: row.reason,
        sarCost: cost.toDecimalPlaces(2).toString(),
        sharePct,
        entryCount: Number(row.entryCount),
      };
    });
}
