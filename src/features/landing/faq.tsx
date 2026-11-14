"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "./landing-icons";
import { RevealOnScroll } from "./reveal-on-scroll";

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

interface FaqProps {
  heading: string;
  items: ReadonlyArray<FaqItem>;
}

export function Faq({ heading, items }: FaqProps) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  function handleToggle(id: string) {
    setOpenId((current) => (current === id ? null : id));
  }

  return (
    <section
      id="faq"
      className="scroll-mt-20 border-y border-border bg-white px-4 py-14 text-brand-text sm:px-6 sm:py-20"
    >
      <div className="mx-auto max-w-[1100px]">
        <RevealOnScroll className="mx-auto max-w-3xl space-y-8">
          <div className="text-start">
            <h2 className="text-2xl font-bold tracking-tight text-brand-dark-teal sm:text-3xl">
              {heading}
            </h2>
          </div>

          <div className="divide-y divide-border rounded-2xl border border-border bg-brand-light-tint/40">
            {items.map((item) => {
              const isOpen = openId === item.id;
              const triggerId = `faq-trigger-${item.id}`;
              const panelId = `faq-panel-${item.id}`;

              return (
                <div key={item.id} className="px-5 py-1 sm:px-6">
                  <h3>
                    <button
                      type="button"
                      id={triggerId}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => handleToggle(item.id)}
                      className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-start text-base font-semibold text-brand-dark-teal transition-colors hover:text-brand-mid-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-mid-teal"
                    >
                      <span>{item.question}</span>
                      <ChevronDownIcon
                        className={cn(
                          "text-brand-mid-teal transition-transform duration-200 motion-reduce:transition-none",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>
                  </h3>

                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={triggerId}
                    hidden={!isOpen}
                    className="pb-4 text-start text-sm leading-relaxed text-brand-text sm:text-base"
                  >
                    <p>{item.answer}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
