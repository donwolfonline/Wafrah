import { describe, expect, it } from "vitest";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";

type KeyedStrings = Record<string, string>;
type LegalMessages = {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: Record<
    string,
    { heading: string; paragraphs?: KeyedStrings; items?: KeyedStrings }
  >;
};

const namespaces = ["privacy", "terms"] as const;

function legal(
  messages: typeof en | typeof ar,
  namespace: (typeof namespaces)[number],
): LegalMessages {
  return messages[namespace] as unknown as LegalMessages;
}

function shape(doc: LegalMessages) {
  return Object.keys(doc.sections)
    .sort()
    .map((key) => [
      key,
      Object.keys(doc.sections[key].paragraphs ?? {}).length,
      Object.keys(doc.sections[key].items ?? {}).length,
    ]);
}

describe("privacy and terms content", () => {
  for (const namespace of namespaces) {
    it(`${namespace}: has real content in both locales with no legal placeholder`, () => {
      for (const messages of [en, ar]) {
        const doc = legal(messages, namespace);
        expect(doc.intro.length).toBeGreaterThan(50);
        expect(Object.keys(doc.sections).length).toBeGreaterThanOrEqual(10);
        expect(JSON.stringify(doc)).not.toContain("TO BE REPLACED");
        expect(JSON.stringify(doc)).not.toContain("PLACEHOLDER");
        for (const section of Object.values(doc.sections)) {
          const bodyCount =
            Object.keys(section.paragraphs ?? {}).length +
            Object.keys(section.items ?? {}).length;
          expect(section.heading.length).toBeGreaterThan(0);
          expect(bodyCount).toBeGreaterThan(0);
        }
      }
    });

    it(`${namespace}: English and Arabic have the same section structure`, () => {
      expect(shape(legal(ar, namespace))).toEqual(
        shape(legal(en, namespace)),
      );
    });
  }
});
