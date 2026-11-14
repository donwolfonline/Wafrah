-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STAFF', 'MANAGER', 'OWNER', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('KG', 'LITER', 'PORTION', 'PIECE');

-- CreateEnum
CREATE TYPE "WasteReason" AS ENUM ('EXPIRED', 'OVER_PREPARATION', 'ORDER_ERROR', 'CUSTOMER_RETURN', 'DAMAGED_IN_PREP', 'OTHER');

-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('MORNING', 'EVENING', 'NIGHT');

-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('DINE_IN', 'DELIVERY', 'TAKEAWAY', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "SalesSource" AS ENUM ('CSV', 'POS', 'MANUAL');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('WASTE_SPIKE', 'TOP_WASTE_ITEM', 'DATA_GAP', 'FORECAST_RISK');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('UNREAD', 'READ', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('SMALL', 'MEDIUM', 'CHAIN');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "shiftConfig" JSONB NOT NULL DEFAULT '{"MORNING":"05:00","EVENING":"15:00","NIGHT":"23:00"}',
    "baselineStart" DATE,
    "baselineEnd" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT,
    "pinHash" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" "Unit" NOT NULL,
    "salesUnitFactor" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "shortageCost" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WasteEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "reason" "WasteReason" NOT NULL,
    "shift" "Shift" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loggedById" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "WasteEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "quantitySold" DECIMAL(12,3) NOT NULL,
    "channel" "SalesChannel" NOT NULL DEFAULT 'UNSPECIFIED',
    "source" "SalesSource" NOT NULL DEFAULT 'CSV',

    CONSTRAINT "SalesRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "cost" DECIMAL(12,2),

    CONSTRAINT "PurchaseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCalendar" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "demandMultiplier" DECIMAL(6,3) NOT NULL DEFAULT 1.0,

    CONSTRAINT "EventCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "forDate" DATE NOT NULL,
    "meanQty" DECIMAL(12,3) NOT NULL,
    "lowQty" DECIMAL(12,3) NOT NULL,
    "highQty" DECIMAL(12,3) NOT NULL,
    "recommendedQty" DECIMAL(12,3) NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inputsSnapshot" JSONB NOT NULL,

    CONSTRAINT "ForecastResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "messageKey" TEXT NOT NULL,
    "messageParams" JSONB NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'UNREAD',
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "renewsAt" TIMESTAMP(3),

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_code_key" ON "Restaurant"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_username_key" ON "User"("tenantId", "username");

-- CreateIndex
CREATE INDEX "MenuItem_tenantId_idx" ON "MenuItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_tenantId_code_key" ON "MenuItem"("tenantId", "code");

-- CreateIndex
CREATE INDEX "WasteEntry_tenantId_idx" ON "WasteEntry"("tenantId");

-- CreateIndex
CREATE INDEX "WasteEntry_tenantId_occurredAt_idx" ON "WasteEntry"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "WasteEntry_tenantId_menuItemId_occurredAt_idx" ON "WasteEntry"("tenantId", "menuItemId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "WasteEntry_tenantId_clientId_key" ON "WasteEntry"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "SalesRecord_tenantId_idx" ON "SalesRecord"("tenantId");

-- CreateIndex
CREATE INDEX "SalesRecord_tenantId_date_idx" ON "SalesRecord"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SalesRecord_tenantId_menuItemId_date_channel_key" ON "SalesRecord"("tenantId", "menuItemId", "date", "channel");

-- CreateIndex
CREATE INDEX "PurchaseRecord_tenantId_idx" ON "PurchaseRecord"("tenantId");

-- CreateIndex
CREATE INDEX "PurchaseRecord_tenantId_date_idx" ON "PurchaseRecord"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRecord_tenantId_menuItemId_date_key" ON "PurchaseRecord"("tenantId", "menuItemId", "date");

-- CreateIndex
CREATE INDEX "EventCalendar_tenantId_idx" ON "EventCalendar"("tenantId");

-- CreateIndex
CREATE INDEX "EventCalendar_startDate_endDate_idx" ON "EventCalendar"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "ForecastResult_tenantId_idx" ON "ForecastResult"("tenantId");

-- CreateIndex
CREATE INDEX "ForecastResult_tenantId_forDate_idx" ON "ForecastResult"("tenantId", "forDate");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastResult_tenantId_menuItemId_forDate_key" ON "ForecastResult"("tenantId", "menuItemId", "forDate");

-- CreateIndex
CREATE INDEX "Alert_tenantId_idx" ON "Alert"("tenantId");

-- CreateIndex
CREATE INDEX "Alert_tenantId_status_createdAt_idx" ON "Alert"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_tenantId_dedupeKey_key" ON "Alert"("tenantId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "Subscription"("tenantId");

-- CreateIndex
CREATE INDEX "Subscription_tenantId_idx" ON "Subscription"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WasteEntry" ADD CONSTRAINT "WasteEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WasteEntry" ADD CONSTRAINT "WasteEntry_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WasteEntry" ADD CONSTRAINT "WasteEntry_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRecord" ADD CONSTRAINT "PurchaseRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRecord" ADD CONSTRAINT "PurchaseRecord_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCalendar" ADD CONSTRAINT "EventCalendar_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastResult" ADD CONSTRAINT "ForecastResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastResult" ADD CONSTRAINT "ForecastResult_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
