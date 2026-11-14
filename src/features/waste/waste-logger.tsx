"use client";

import type { Role, Shift, WasteReason } from "@prisma/client";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  clearRetryTimer,
  flushWasteQueue,
  generateClientId,
  listQueuedWasteEntries,
  markClientIdCancelled,
  type QueuedWasteEntry,
  removeQueuedWasteEntry,
  resetQueueRetryTimers,
  saveQueuedWasteEntry,
} from "./offline-queue";
import {
  UNDO_WINDOW_MS,
  type WasteLogBootstrapDto,
  type WasteLogMenuItemDto,
} from "./schemas";
import { detectShift } from "./shift";
import { type ActiveUndoState, WasteHeaderBar } from "./waste-header-bar";
import { WasteStepComposer } from "./waste-step-composer";
import { WasteStepItems } from "./waste-step-items";

function subscribeOnlineStatus(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getClientOfflineSnapshot(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function getServerOfflineSnapshot(): boolean {
  return false;
}

interface WasteLoggerProps {
  initialData: WasteLogBootstrapDto;
  userRole: Role;
}

export function WasteLogger({ initialData, userRole }: WasteLoggerProps) {
  const t = useTranslations("waste");
  const locale = useLocale();

  const [selectedItem, setSelectedItem] = useState<WasteLogMenuItemDto | null>(
    null,
  );
  const [activeShiftForSelection, setActiveShiftForSelection] = useState<Shift>(
    initialData.currentShift,
  );
  const [serverTodayWasteSar, setServerTodayWasteSar] = useState<string>(
    initialData.todayWasteSar,
  );
  const [userItemCounts, setUserItemCounts] = useState<Record<string, number>>(
    initialData.userItemCounts,
  );
  const [queueEntries, setQueueEntries] = useState<QueuedWasteEntry[]>([]);
  const browserOffline = useSyncExternalStore(
    subscribeOnlineStatus,
    getClientOfflineSnapshot,
    getServerOfflineSnapshot,
  );
  const [networkOffline, setNetworkOffline] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<boolean>(false);
  const [authExpired, setAuthExpired] = useState<boolean>(false);
  const isOffline = browserOffline || networkOffline;
  const [undoState, setUndoState] = useState<ActiveUndoState | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState<number>(10);

  const syncCallbacksRef = useMemo(
    () => ({
      onQueueChange: setQueueEntries,
      onOfflineChange: setNetworkOffline,
      onServerTodayWasteSar: setServerTodayWasteSar,
      onSyncError: setSyncError,
      onAuthExpired: () => setAuthExpired(true),
    }),
    [],
  );

  useEffect(() => {
    void flushWasteQueue(syncCallbacksRef);

    const handleOnline = () => {
      setNetworkOffline(false);
      void resetQueueRetryTimers().then(() => flushWasteQueue(syncCallbacksRef));
    };
    const handleOffline = () => {
      setNetworkOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearRetryTimer();
    };
  }, [syncCallbacksRef]);

  useEffect(() => {
    if (!undoState) return;
    const updateCountdown = () => {
      const remainingMs = undoState.expiresAtMs - Date.now();
      if (remainingMs <= 0) {
        setUndoState(null);
      } else {
        setUndoSecondsLeft(Math.ceil(remainingMs / 1000));
      }
    };
    const timer = setTimeout(updateCountdown, 0);
    const interval = setInterval(updateCountdown, 250);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [undoState]);

  const recentItems = useMemo(() => {
    const itemMap = new Map(initialData.items.map((i) => [i.id, i]));
    const scored = initialData.items
      .map((item) => ({
        item,
        count: userItemCounts[item.id] ?? 0,
        fallbackOrder: initialData.recentItemIds.indexOf(item.id),
      }))
      .filter((entry) => entry.count > 0 || entry.fallbackOrder !== -1)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        const aIdx = a.fallbackOrder === -1 ? 999 : a.fallbackOrder;
        const bIdx = b.fallbackOrder === -1 ? 999 : b.fallbackOrder;
        return aIdx - bIdx;
      });

    return scored
      .slice(0, 6)
      .map((s) => itemMap.get(s.item.id))
      .filter((i): i is WasteLogMenuItemDto => Boolean(i));
  }, [initialData.items, initialData.recentItemIds, userItemCounts]);

  const totalTodayWasteSar = useMemo(() => {
    const serverBase = Number.parseFloat(serverTodayWasteSar || "0");
    let unsyncedSum = 0;
    for (const q of queueEntries) {
      const qty = Number.parseFloat(q.quantity || "0");
      const cost = Number.parseFloat(q.unitCost || "0");
      if (Number.isFinite(qty) && Number.isFinite(cost)) {
        unsyncedSum += qty * cost;
      }
    }
    return (Math.round((serverBase + unsyncedSum) * 100) / 100).toFixed(2);
  }, [serverTodayWasteSar, queueEntries]);

  const handleUndo = async (target: ActiveUndoState) => {
    markClientIdCancelled(target.clientId);
    setUndoState((prev) => (prev?.clientId === target.clientId ? null : prev));
    setUserItemCounts((prev) => ({
      ...prev,
      [target.menuItemId]: Math.max(0, (prev[target.menuItemId] ?? 1) - 1),
    }));

    await removeQueuedWasteEntry(target.clientId);
    const updatedQueue = await listQueuedWasteEntries();
    setQueueEntries(updatedQueue);

    if (typeof window === "undefined" || navigator.onLine !== false) {
      try {
        const res = await fetch(
          `/api/waste-entries?clientId=${encodeURIComponent(target.clientId)}`,
          { method: "DELETE" },
        );
        if (res.ok) {
          const data = (await res.json()) as { todayWasteSar?: string };
          if (data.todayWasteSar) {
            setServerTodayWasteSar(data.todayWasteSar);
          }
        }
      } catch {
        // Entry was only local or network dropped
      }
    }

    toast.info(t("undoneToastTitle"));
  };

  const handleSaveEntry = async (payload: {
    quantity: string;
    reason: WasteReason;
    shift: Shift;
  }) => {
    if (!selectedItem) return;

    const clientId = generateClientId();
    const now = new Date();
    const itemLabel =
      locale === "ar"
        ? selectedItem.nameAr || selectedItem.name
        : selectedItem.name || selectedItem.nameAr;
    const unitLabel = t(`units.${selectedItem.unit}`);

    const queued: QueuedWasteEntry = {
      clientId,
      menuItemId: selectedItem.id,
      menuItemName: selectedItem.name,
      menuItemNameAr: selectedItem.nameAr,
      unit: selectedItem.unit,
      unitCost: selectedItem.unitCost,
      quantity: payload.quantity,
      reason: payload.reason,
      shift: payload.shift,
      occurredAt: now.toISOString(),
      createdAtMs: now.getTime(),
      attempts: 0,
      nextRetryAtMs: now.getTime(),
    };

    await saveQueuedWasteEntry(queued);
    const allQueued = await listQueuedWasteEntries();
    setQueueEntries(allQueued);

    setUserItemCounts((prev) => ({
      ...prev,
      [selectedItem.id]: (prev[selectedItem.id] ?? 0) + 1,
    }));

    const newUndoState: ActiveUndoState = {
      clientId,
      menuItemId: selectedItem.id,
      itemLabel,
      quantity: payload.quantity,
      unitLabel,
      expiresAtMs: Date.now() + UNDO_WINDOW_MS,
    };
    setUndoState(newUndoState);
    setUndoSecondsLeft(10);

    setSelectedItem(null);

    toast.success(
      t("savedToastTitle", {
        quantity: payload.quantity,
        unit: unitLabel,
        item: itemLabel,
      }),
      {
        duration: UNDO_WINDOW_MS,
        action: {
          label: t("undoButton", { seconds: 10 }),
          onClick: () => {
            void handleUndo(newUndoState);
          },
        },
      },
    );

    void flushWasteQueue(syncCallbacksRef);
  };

  const handleRetrySync = () => {
    setSyncError(false);
    void resetQueueRetryTimers().then(() => flushWasteQueue(syncCallbacksRef));
  };

  const handleSelectItem = (item: WasteLogMenuItemDto) => {
    setActiveShiftForSelection(
      detectShift(new Date(), initialData.shiftConfig),
    );
    setSelectedItem(item);
  };

  const restaurantDisplayName =
    locale === "ar"
      ? initialData.restaurantNameAr || initialData.restaurantName
      : initialData.restaurantName || initialData.restaurantNameAr;

  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="waste-logger">
      <Toaster position="bottom-center" />

      <WasteHeaderBar
        restaurantDisplayName={restaurantDisplayName}
        isOffline={isOffline}
        syncError={syncError}
        authExpired={authExpired}
        pendingCount={queueEntries.length}
        totalTodayWasteSar={totalTodayWasteSar}
        userRole={userRole}
        undoState={undoState}
        undoSecondsLeft={undoSecondsLeft}
        onUndo={(target) => void handleUndo(target)}
        onRetrySync={handleRetrySync}
      />

      {selectedItem ? (
        <WasteStepComposer
          item={selectedItem}
          initialShift={activeShiftForSelection}
          maxQuantityByUnit={initialData.maxQuantityByUnit}
          onBack={() => setSelectedItem(null)}
          onSave={(payload) => void handleSaveEntry(payload)}
        />
      ) : (
        <WasteStepItems
          items={initialData.items}
          recentItems={recentItems}
          onSelectItem={handleSelectItem}
        />
      )}
    </div>
  );
}
