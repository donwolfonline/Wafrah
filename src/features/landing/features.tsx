import { Card, CardContent } from "@/components/ui/card";
import { FeatureIcon } from "./landing-icons";
import { RevealOnScroll } from "./reveal-on-scroll";

export type FeatureIconKey =
  | "offline"
  | "alerts"
  | "recommendations"
  | "report"
  | "bilingual"
  | "csv";

export interface FeatureCardItem {
  key: FeatureIconKey;
  title: string;
  description: string;
}

interface FeaturesProps {
  heading: string;
  subheading: string;
  cards: ReadonlyArray<FeatureCardItem>;
}

export function Features({ heading, subheading, cards }: FeaturesProps) {
  return (
    <section
      id="features"
      className="scroll-mt-20 bg-brand-light-tint px-4 py-14 text-brand-text sm:px-6 sm:py-20"
    >
      <div className="mx-auto max-w-[1100px]">
        <RevealOnScroll className="space-y-8">
          <div className="max-w-2xl space-y-2 text-start">
            <h2 className="text-2xl font-bold tracking-tight text-brand-dark-teal sm:text-3xl">
              {heading}
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              {subheading}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <Card
                key={card.key}
                className="border-border bg-white py-6 shadow-xs transition-shadow duration-200 hover:shadow-md"
              >
                <CardContent className="space-y-3.5 px-6 text-start">
                  <div className="inline-flex size-11 items-center justify-center rounded-xl bg-brand-light-tint ring-1 ring-border">
                    <FeatureIcon name={card.key} />
                  </div>
                  <h3 className="text-lg font-bold leading-snug text-brand-dark-teal">
                    {card.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-brand-text">
                    {card.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
