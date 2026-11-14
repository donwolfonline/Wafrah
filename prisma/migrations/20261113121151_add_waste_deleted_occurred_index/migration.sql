-- CreateIndex
CREATE INDEX "WasteEntry_tenantId_deletedAt_occurredAt_idx" ON "WasteEntry"("tenantId", "deletedAt", "occurredAt");
