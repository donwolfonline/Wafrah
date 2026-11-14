import { Card, CardContent } from "@/components/ui/card";
import { DirectionalArrowIcon } from "./landing-icons";
import { RevealOnScroll } from "./reveal-on-scroll";

interface HowItWorksStep {
  number: string;
  title: string;
  description: string;
}

interface HowItWorksProps {
  heading: string;
  subheading: string;
  steps: ReadonlyArray<HowItWorksStep>;
}

export function HowItWorks({
  heading,
  subheading,
  steps,
}: HowItWorksProps) {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-20 border-y border-border bg-white px-4 py-14 text-brand-text sm:px-6 sm:py-20"
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

          <div className="grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.number} className="relative flex items-stretch gap-3">
                <Card className="w-full border-border bg-brand-light-tint/55 py-6 shadow-xs">
                  <CardContent className="space-y-4 px-6 text-start">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-dark-teal text-lg font-bold tabular-nums text-white ring-2 ring-brand-gold/70">
                        {step.number}
                      </span>
                      {index < steps.length - 1 ? (
                        <span className="hidden size-8 items-center justify-center rounded-full bg-white text-brand-mid-teal ring-1 ring-border shadow-2xs md:inline-flex">
                          <DirectionalArrowIcon />
                        </span>
                      ) : null}
                    </div>
                    <h3 className="text-xl font-bold text-brand-dark-teal">
                      {step.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-brand-text sm:text-base">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
