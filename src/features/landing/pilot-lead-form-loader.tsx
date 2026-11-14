"use client";

import dynamic from "next/dynamic";
import type { AppLocale } from "@/i18n/request";

export interface PilotLeadFormLoaderProps {
  locale: AppLocale;
  whatsappCtaLabel: string;
  whatsappPrefilledMessage: string;
}

const DynamicPilotLeadForm = dynamic(
  () => import("./pilot-lead-form").then((mod) => mod.PilotLeadForm),
  { ssr: true },
);

export function PilotLeadFormLoader(props: PilotLeadFormLoaderProps) {
  return <DynamicPilotLeadForm {...props} />;
}
