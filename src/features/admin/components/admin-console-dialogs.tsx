"use client";

import type { ComponentProps } from "react";
import type { AdminCustomerSummary } from "../types";
import { CreateRestaurantDialog } from "./create-restaurant-dialog";
import { DeleteRestaurantDialog } from "./delete-restaurant-dialog";
import { DiagnosticsDialog } from "./diagnostics-dialog";
import { SubscriptionEditDialog } from "./subscription-edit-dialog";

interface AdminConsoleDialogsProps {
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  onCreated: ComponentProps<typeof CreateRestaurantDialog>["onCreated"];
  editingCustomer: AdminCustomerSummary | null;
  onClearEditingCustomer: () => void;
  onUpdated: ComponentProps<typeof SubscriptionEditDialog>["onUpdated"];
  diagnosticsCustomer: AdminCustomerSummary | null;
  onClearDiagnosticsCustomer: () => void;
  deletingCustomer: AdminCustomerSummary | null;
  onClearDeletingCustomer: () => void;
  onDeleted: ComponentProps<typeof DeleteRestaurantDialog>["onDeleted"];
}

export function AdminConsoleDialogs({
  createOpen,
  onCreateOpenChange,
  onCreated,
  editingCustomer,
  onClearEditingCustomer,
  onUpdated,
  diagnosticsCustomer,
  onClearDiagnosticsCustomer,
  deletingCustomer,
  onClearDeletingCustomer,
  onDeleted,
}: AdminConsoleDialogsProps) {
  return (
    <>
      <CreateRestaurantDialog
        open={createOpen}
        onOpenChange={onCreateOpenChange}
        onCreated={onCreated}
      />

      <SubscriptionEditDialog
        key={editingCustomer?.id ?? "none"}
        customer={editingCustomer}
        onOpenChange={(open) => {
          if (!open) onClearEditingCustomer();
        }}
        onUpdated={onUpdated}
      />

      <DiagnosticsDialog
        customer={diagnosticsCustomer}
        onOpenChange={(open) => {
          if (!open) onClearDiagnosticsCustomer();
        }}
      />

      <DeleteRestaurantDialog
        key={deletingCustomer?.id ?? "none-delete"}
        customer={deletingCustomer}
        onOpenChange={(open) => {
          if (!open) onClearDeletingCustomer();
        }}
        onDeleted={onDeleted}
      />
    </>
  );
}
