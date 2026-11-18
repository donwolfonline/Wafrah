"use client";

import { useState } from "react";
import { MessageSquarePlus, Star } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FeedbackWidgetProps {
  kitchenMode?: boolean;
}

const RATINGS = [1, 2, 3, 4, 5] as const;

export function FeedbackWidget({ kitchenMode = false }: FeedbackWidgetProps) {
  const t = useTranslations("feedback");
  const pathname = usePathname() || "/";

  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setErrorText(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText(null);

    if (rating < 1 || rating > 5) {
      setErrorText(t("selectRatingError"));
      return;
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setErrorText(t("emptyMessageError"));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          message: trimmedMessage,
          page: pathname,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        const msg = payload.error || t("errorToast");
        setErrorText(msg);
        toast.error(msg);
        return;
      }

      toast.success(t("successToast"));
      setRating(0);
      setMessage("");
      setOpen(false);
    } catch {
      const msg = t("errorToast");
      setErrorText(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={cn(
        "fixed end-3 z-40 print:hidden sm:end-4 md:bottom-6 md:end-6",
        kitchenMode
          ? "bottom-[calc(1rem+env(safe-area-inset-bottom))]"
          : "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]",
      )}
    >
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button
            type="button"
            size={kitchenMode ? "lg" : "default"}
            variant="secondary"
            aria-label={t("triggerLabel")}
            data-testid="floating-feedback-trigger"
            className={cn(
              "gap-2 rounded-full border border-border/80 bg-card text-foreground shadow-lg hover:bg-accent",
              kitchenMode
                ? "size-11 px-0 sm:h-10 sm:w-auto sm:px-5"
                : "size-10 px-0 sm:h-9 sm:w-auto sm:px-4",
            )}
          >
            <MessageSquarePlus className="size-4 shrink-0 text-primary" />
            <span className="sr-only sm:not-sr-only">{t("triggerLabel")}</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("dialogSubtitle", { page: pathname })}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("ratingLabel")}</Label>
              <div
                role="radiogroup"
                aria-label={t("ratingLabel")}
                className="flex items-center gap-1.5"
              >
                {RATINGS.map((star) => {
                  const active = star <= rating;
                  return (
                    <button
                      key={star}
                      type="button"
                      role="radio"
                      aria-checked={rating === star}
                      aria-label={t("starLabel", { star })}
                      onClick={() => setRating(star)}
                      className={cn(
                        "inline-flex size-11 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        active
                          ? "border-amber-400 bg-amber-50 text-amber-500"
                          : "border-border bg-background text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <Star
                        className={cn(
                          "size-5",
                          active && "fill-amber-400 text-amber-500",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-message">{t("messageLabel")}</Label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={t("messagePlaceholder")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
              />
            </div>

            {errorText ? (
              <p className="text-sm font-medium text-destructive">{errorText}</p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("submitting") : t("submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
