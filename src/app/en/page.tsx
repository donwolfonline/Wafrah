import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/landing-page";
import { buildLandingMetadata } from "@/features/landing/landing-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildLandingMetadata("en");
}

export default async function EnglishLandingPage() {
  return <LandingPage locale="en" />;
}
