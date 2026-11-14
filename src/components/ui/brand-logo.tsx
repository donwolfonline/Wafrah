import { cn } from "@/lib/utils";

interface BrandLogoProps {
  wordmark: string;
  subtitle?: string;
  variant?: "onDark" | "onLight";
  className?: string;
}

/**
 * Shared Wafrah emblem and wordmark rendered identically across the public landing
 * pages and the authenticated/auth application header.
 */
export function BrandLogo({
  wordmark,
  subtitle,
  variant = "onDark",
  className,
}: BrandLogoProps) {
  const isDark = variant === "onDark";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width="36"
        height="36"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        data-brand-mark="wafrah"
        className="size-9 shrink-0"
      >
        <rect
          x="1"
          y="1"
          width="34"
          height="34"
          rx="9"
          fill={isDark ? "#0E6B5C" : "#0B4F45"}
          stroke="#C9A227"
          strokeWidth="1.5"
        />
        <path
          d="M18 8.5C13.6 11.4 11 15.6 11 20C11 24 14.1 27 18 27C21.9 27 25 24 25 20C25 15.6 22.4 11.4 18 8.5Z"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18 13.5V26.5"
          stroke="#C9A227"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M18 18.5C19.8 17.3 21.3 17 22.6 17.2"
          stroke="#C9A227"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="18" cy="10.5" r="1.4" fill="#C9A227" />
      </svg>
      <span className="flex flex-col text-start leading-tight">
        <span
          className={cn(
            "text-sm font-bold tracking-tight whitespace-nowrap sm:text-base",
            isDark ? "text-white" : "text-brand-dark-teal dark:text-white",
          )}
        >
          {wordmark}
        </span>
        {subtitle ? (
          <span
            className={cn(
              "hidden text-[11px] font-medium leading-snug sm:inline-block lg:whitespace-nowrap",
              isDark ? "text-[#CDE5DF]" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  );
}
