export type LegalDocumentNamespace = "privacy" | "terms";

export interface LegalSection {
  id: string;
  number: string;
  heading: string;
  headingText: string;
  paragraphs: string[];
  items: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedStrings(raw: unknown): string[] {
  if (!isRecord(raw)) {
    return [];
  }
  return Object.keys(raw)
    .sort()
    .map((key) => raw[key])
    .filter((value): value is string => typeof value === "string");
}

/** Splits an optional `"1. Heading"` prefix into badge number + clean title. */
export function splitSectionHeading(
  heading: string,
  fallbackIndex: number,
): { number: string; headingText: string } {
  const match = /^(\d+)\.\s*(.+)$/.exec(heading.trim());
  if (match) {
    return {
      number: match[1],
      headingText: match[2],
    };
  }
  return {
    number: String(fallbackIndex + 1),
    headingText: heading.trim(),
  };
}

// Legal copy is stored as keyed objects (s01, p01, i01, ...) because
// next-intl message types do not allow arrays.
export function parseLegalSections(raw: unknown): LegalSection[] {
  if (!isRecord(raw)) {
    return [];
  }
  return Object.keys(raw)
    .sort()
    .flatMap((key, index) => {
      const section = raw[key];
      if (!isRecord(section) || typeof section.heading !== "string") {
        return [];
      }
      const { number, headingText } = splitSectionHeading(
        section.heading,
        index,
      );
      return [
        {
          id: `section-${key}`,
          number,
          heading: section.heading,
          headingText,
          paragraphs: sortedStrings(section.paragraphs),
          items: sortedStrings(section.items),
        },
      ];
    });
}
