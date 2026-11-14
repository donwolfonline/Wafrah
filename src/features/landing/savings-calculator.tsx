"use client";

import dynamic from "next/dynamic";
import type { SavingsCalculatorCopy } from "./savings-calculator-results";
import type { SavingsCalculatorProps } from "./savings-calculator-panel";

export type { SavingsCalculatorCopy };

const DynamicSavingsCalculator = dynamic(
  () =>
    import("./savings-calculator-panel").then(
      (mod) => mod.SavingsCalculatorPanel,
    ),
  { ssr: true },
);

export function SavingsCalculator(props: SavingsCalculatorProps) {
  return <DynamicSavingsCalculator {...props} />;
}
