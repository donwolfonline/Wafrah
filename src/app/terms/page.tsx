import type { Metadata } from "next";
import { LegalDocument } from "@/features/legal/legal-document";
import { NOINDEX_PLACEHOLDER_METADATA } from "@/lib/seo";

export const metadata: Metadata = NOINDEX_PLACEHOLDER_METADATA;

export default function TermsPage() {
  return <LegalDocument namespace="terms" />;
}
