"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

/**
 * Registers `/sw.js` with `updateViaCache: "none"` and shows a non-disruptive
 * toast whenever a new service worker build finishes installing into `waiting`,
 * activating cleanly on next launch without touching IndexedDB queues.
 */
export function ServiceWorkerRegistrar() {
  const t = useTranslations("common");
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    let cancelled = false;
    let currentRegistration: ServiceWorkerRegistration | undefined;
    let trackedWorker: ServiceWorker | null = null;

    const notifyUpdateReady = () => {
      if (cancelled || notifiedRef.current) return;
      notifiedRef.current = true;
      void import("sonner")
        .then(({ toast }) => {
          if (cancelled) return;
          toast.info(t("pwaUpdateAvailable"), {
            id: "wafrah-pwa-update",
            description: t("pwaUpdateDescription"),
            duration: 10_000,
          });
        })
        .catch(() => {
          // Ignore toast UI failures when Toast container is absent.
        });
    };

    const handleInstallingStateChange = () => {
      if (
        trackedWorker?.state === "installed" &&
        Boolean(navigator.serviceWorker.controller)
      ) {
        notifyUpdateReady();
      }
    };

    const handleUpdateFound = () => {
      const installing = currentRegistration?.installing ?? null;
      if (!installing) return;
      if (trackedWorker) {
        trackedWorker.removeEventListener(
          "statechange",
          handleInstallingStateChange,
        );
      }
      trackedWorker = installing;
      trackedWorker.addEventListener(
        "statechange",
        handleInstallingStateChange,
      );
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (cancelled) return;
        currentRegistration = registration;

        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyUpdateReady();
        }

        registration.addEventListener("updatefound", handleUpdateFound);
      })
      .catch(() => {
        // Ignore service worker registration failures in unsupported contexts.
      });

    return () => {
      cancelled = true;
      currentRegistration?.removeEventListener("updatefound", handleUpdateFound);
      trackedWorker?.removeEventListener(
        "statechange",
        handleInstallingStateChange,
      );
    };
  }, [t]);

  return null;
}
