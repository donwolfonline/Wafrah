import type { Metadata } from "next";

export const DISALLOWED_APP_PATH_PREFIXES = [
  "/dashboard",
  "/log",
  "/admin",
  "/login",
  "/menu",
  "/imports",
  "/reports",
  "/settings",
  "/api",
  "/design-check",
] as const;

export const NOINDEX_FOLLOW_FALSE_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
};

export const NOINDEX_FOLLOW_TRUE_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: true,
};

export const NOINDEX_METADATA: Metadata = {
  robots: NOINDEX_FOLLOW_FALSE_ROBOTS,
};

export const NOINDEX_PLACEHOLDER_METADATA: Metadata = {
  robots: NOINDEX_FOLLOW_TRUE_ROBOTS,
};
