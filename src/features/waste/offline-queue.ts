import type { Shift, Unit, WasteReason } from "@prisma/client";

export interface QueuedWasteEntry {
  clientId: string;
  menuItemId: string;
  menuItemName: string;
  menuItemNameAr: string;
  unit: Unit;
  unitCost: string;
  quantity: string;
  reason: WasteReason;
  shift: Shift;
  occurredAt: string;
  createdAtMs: number;
  attempts: number;
  nextRetryAtMs: number;
}

const DB_NAME = "wafrah-waste-queue-db";
const DB_VERSION = 1;
const STORE_NAME = "waste_entries";

const memoryFallback = new Map<string, QueuedWasteEntry>();
const cancelledClientIds = new Set<string>();
let isFlushing = false;
let pendingFlush = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export function markClientIdCancelled(clientId: string): void {
  cancelledClientIds.add(clientId);
}

export function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

export function generateClientId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function computeBackoffDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(30_000, 1_000 * 2 ** exponent);
}

function hasIndexedDb(): boolean {
  return (
    typeof window !== "undefined" && typeof window.indexedDB !== "undefined"
  );
}

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "clientId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function listQueuedWasteEntries(): Promise<QueuedWasteEntry[]> {
  if (!hasIndexedDb()) {
    return Array.from(memoryFallback.values()).sort(
      (a, b) => a.createdAtMs - b.createdAtMs,
    );
  }

  try {
    const db = await openQueueDb();
    return await new Promise<QueuedWasteEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as QueuedWasteEntry[]) ?? [];
        rows.sort((a, b) => a.createdAtMs - b.createdAtMs);
        resolve(rows);
      };
      req.onerror = () =>
        reject(req.error ?? new Error("Failed to read queue"));
    });
  } catch {
    return Array.from(memoryFallback.values()).sort(
      (a, b) => a.createdAtMs - b.createdAtMs,
    );
  }
}

export async function saveQueuedWasteEntry(
  entry: QueuedWasteEntry,
): Promise<void> {
  memoryFallback.set(entry.clientId, entry);

  if (!hasIndexedDb()) {
    return;
  }

  try {
    const db = await openQueueDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("Failed to write queued entry"));
    });
  } catch {
    // Fallback map already updated
  }
}

export async function removeQueuedWasteEntry(clientId: string): Promise<void> {
  memoryFallback.delete(clientId);

  if (!hasIndexedDb()) {
    return;
  }

  try {
    const db = await openQueueDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(clientId);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("Failed to delete queued entry"));
    });
  } catch {
    // Fallback map already updated
  }
}

export async function resetQueueRetryTimers(): Promise<QueuedWasteEntry[]> {
  const entries = await listQueuedWasteEntries();
  const now = Date.now();
  const updated: QueuedWasteEntry[] = [];
  for (const entry of entries) {
    const next: QueuedWasteEntry = {
      ...entry,
      nextRetryAtMs: now,
    };
    await saveQueuedWasteEntry(next);
    updated.push(next);
  }
  return updated;
}

export interface SyncQueueCallbacks {
  onQueueChange: (entries: QueuedWasteEntry[]) => void;
  onOfflineChange: (offline: boolean) => void;
  onServerTodayWasteSar: (sar: string) => void;
  onSyncError?: (hasError: boolean) => void;
  onAuthExpired?: () => void;
}

export async function flushWasteQueue(
  callbacks: SyncQueueCallbacks,
): Promise<void> {
  if (isFlushing) {
    pendingFlush = true;
    return;
  }

  isFlushing = true;
  clearRetryTimer();
  let encounteredRetryableError = false;

  try {
    const entries = await listQueuedWasteEntries();
    callbacks.onQueueChange(entries);

    if (typeof window !== "undefined" && navigator.onLine === false) {
      callbacks.onOfflineChange(true);
      callbacks.onSyncError?.(false);
      return;
    }

    let earliestNextRetry: number | null = null;

    for (const entry of entries) {
      if (cancelledClientIds.has(entry.clientId)) {
        await removeQueuedWasteEntry(entry.clientId);
        continue;
      }

      const now = Date.now();
      if (entry.nextRetryAtMs > now) {
        if (
          earliestNextRetry === null ||
          entry.nextRetryAtMs < earliestNextRetry
        ) {
          earliestNextRetry = entry.nextRetryAtMs;
        }
        continue;
      }

      try {
        const response = await fetch("/api/waste-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: entry.clientId,
            menuItemId: entry.menuItemId,
            quantity: entry.quantity,
            reason: entry.reason,
            shift: entry.shift,
            occurredAt: entry.occurredAt,
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as {
            todayWasteSar?: string;
          };
          await removeQueuedWasteEntry(entry.clientId);
          callbacks.onOfflineChange(false);

          if (cancelledClientIds.has(entry.clientId)) {
            const undoRes = await fetch(
              `/api/waste-entries?clientId=${encodeURIComponent(entry.clientId)}`,
              { method: "DELETE" },
            );
            if (undoRes.ok) {
              const undoData = (await undoRes.json()) as {
                todayWasteSar?: string;
              };
              if (undoData.todayWasteSar) {
                callbacks.onServerTodayWasteSar(undoData.todayWasteSar);
              }
            }
          } else if (data.todayWasteSar) {
            callbacks.onServerTodayWasteSar(data.todayWasteSar);
          }
        } else if (response.status === 401) {
          callbacks.onAuthExpired?.();
          encounteredRetryableError = true;
          break;
        } else if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429
        ) {
          await removeQueuedWasteEntry(entry.clientId);
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch {
        if (typeof window !== "undefined" && navigator.onLine === false) {
          callbacks.onOfflineChange(true);
        } else {
          encounteredRetryableError = true;
        }
        const nextAttempts = entry.attempts + 1;
        const delayMs = computeBackoffDelayMs(nextAttempts);
        const nextRetryAtMs = Date.now() + delayMs;
        await saveQueuedWasteEntry({
          ...entry,
          attempts: nextAttempts,
          nextRetryAtMs,
        });
        if (earliestNextRetry === null || nextRetryAtMs < earliestNextRetry) {
          earliestNextRetry = nextRetryAtMs;
        }
        break;
      }
    }

    const remaining = await listQueuedWasteEntries();
    callbacks.onQueueChange(remaining);
    if (!encounteredRetryableError) {
      callbacks.onSyncError?.(false);
    } else {
      callbacks.onSyncError?.(true);
    }

    if (
      remaining.length > 0 &&
      earliestNextRetry !== null &&
      (typeof window === "undefined" || navigator.onLine !== false)
    ) {
      const waitMs = Math.max(250, earliestNextRetry - Date.now());
      retryTimer = setTimeout(() => {
        void flushWasteQueue(callbacks);
      }, waitMs);
    }
  } finally {
    isFlushing = false;
    if (pendingFlush) {
      pendingFlush = false;
      void flushWasteQueue(callbacks);
    }
  }
}
