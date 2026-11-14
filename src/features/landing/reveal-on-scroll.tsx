"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RevealOnScrollProps {
  children: ReactNode;
  className?: string;
}

export function RevealOnScroll({ children, className }: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealState, setRevealState] = useState<"idle" | "pending" | "visible">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") {
      return;
    }

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion || !("IntersectionObserver" in window)) {
      return;
    }

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) {
      return;
    }

    setRevealState("pending");

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealState("visible");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -40px 0px", threshold: 0.05 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-reveal={revealState === "idle" ? undefined : revealState}
      className={cn("landing-reveal", className)}
    >
      {children}
    </div>
  );
}
