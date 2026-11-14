-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('SALES', 'PURCHASES');

-- CreateTable
CREATE TABLE "ImportColumnMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "ImportType" NOT NULL,
    "mapping" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportColumnMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "type" "ImportType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowsImported" INTEGER NOT NULL,
    "rowsRejected" INTEGER NOT NULL,
    "rowsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportColumnMapping_tenantId_idx" ON "ImportColumnMapping"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportColumnMapping_tenantId_type_key" ON "ImportColumnMapping"("tenantId", "type");

-- CreateIndex
CREATE INDEX "ImportBatch_tenantId_createdAt_idx" ON "ImportBatch"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_uploadedById_idx" ON "ImportBatch"("uploadedById");

-- AddForeignKey
ALTER TABLE "ImportColumnMapping" ADD CONSTRAINT "ImportColumnMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
