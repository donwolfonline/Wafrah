import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

type IconProps = SVGProps<SVGSVGElement>;

export function DirectionalArrowIcon({ className, ...props }: IconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={cn("size-4 shrink-0 rtl-flip", className)}
      {...props}
    >
      <path
        d="M4.5 10H15.5M15.5 10L11 5.5M15.5 10L11 14.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WhatsAppIcon({ className, ...props }: IconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M20 11.7A8 8 0 0 1 8.4 18.8L4 20L5.3 15.8A8 8 0 1 1 20 11.7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 9.2C9.7 8.8 10 8.8 10.3 8.8H10.8C11 8.8 11.2 8.9 11.3 9.2L11.8 10.4C11.9 10.6 11.9 10.8 11.7 11L11.2 11.5C11.7 12.4 12.5 13.1 13.4 13.6L13.9 13.1C14.1 12.9 14.3 12.9 14.5 13L15.7 13.5C15.9 13.6 16 13.8 16 14V14.5C16 15.1 15.4 15.6 14.8 15.6C12 15.5 8.5 12.4 8.5 9.8C8.5 9.5 9 9.2 9.5 9.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CheckCircleIcon({ className, ...props }: IconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6.8 10.2L9.1 12.4L13.4 7.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronDownIcon({ className, ...props }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={cn("size-5 shrink-0", className)}
      {...props}
    >
      <path
        d="M5.5 7.75L10 12.25L14.5 7.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FeatureIcon({
  name,
  className,
}: {
  name:
    | "offline"
    | "alerts"
    | "recommendations"
    | "report"
    | "bilingual"
    | "csv";
  className?: string;
}) {
  const shared = cn("size-6 shrink-0 text-brand-mid-teal", className);

  switch (name) {
    case "offline":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={shared}>
          <rect x="6" y="3" width="12" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9.5 11.5L11.2 13.2L14.8 9.6" stroke="#C9A227" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.5 17.5H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "alerts":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={shared}>
          <path d="M12 4.5C8.9 4.5 7 6.8 7 10V14L5.2 16.5H18.8L17 14V10C17 6.8 15.1 4.5 12 4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M10 18.8C10.5 19.7 11.2 20.2 12 20.2C12.8 20.2 13.5 19.7 14 18.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="17" cy="6.5" r="2.2" fill="#C9A227" />
        </svg>
      );
    case "recommendations":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={shared}>
          <rect x="4" y="4" width="16" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 9H16M8 13H13.5M8 17H11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="16.5" cy="15.5" r="2" fill="#C9A227" />
        </svg>
      );
    case "report":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={shared}>
          <path d="M7 3.8H14.2L18 7.6V19.2C18 19.8 17.6 20.2 17 20.2H7C6.4 20.2 6 19.8 6 19.2V4.8C6 4.2 6.4 3.8 7 3.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9.5 15.5V12.5M12 15.5V10.5M14.5 15.5V13.5" stroke="#C9A227" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    case "bilingual":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={shared}>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.8 12H20.2M12 3.5C14.3 6 15.5 8.9 15.5 12C15.5 15.1 14.3 18 12 20.5C9.7 18 8.5 15.1 8.5 12C8.5 8.9 9.7 6 12 3.5Z" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "csv":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={shared}>
          <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4 10H20M10 10V19M15 10V19" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 2.5V6.5M12 6.5L10.3 4.8M12 6.5L13.7 4.8" stroke="#C9A227" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}
