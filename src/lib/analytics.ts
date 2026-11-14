export type AnalyticsEvent =
  | "cta_click"
  | "whatsapp_click"
  | "calculator_used"
  | "lead_submit";

export type AnalyticsPropValue = string | number | boolean;

export type AnalyticsProps = Record<string, AnalyticsPropValue>;

export function isAnalyticsEnabled(
  rawProvider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER,
): boolean {
  return Boolean(rawProvider?.trim());
}

/**
 * Lightweight, privacy-safe analytics hook.
 * No-ops completely until NEXT_PUBLIC_ANALYTICS_PROVIDER is configured and wired.
 */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  const provider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER?.trim();
  if (!provider) {
    return;
  }

  // No analytics provider package is installed yet; keep non-PII dispatch point ready.
  void provider;
  void event;
  void props;
}
