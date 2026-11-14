-- CreateEnum
CREATE TYPE "LeadCity" AS ENUM ('MAKKAH', 'JEDDAH', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadPosSystem" AS ENUM ('FOODICS', 'MARN', 'OTHER', 'NONE');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'PILOT', 'NOT_FIT');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "city" "LeadCity" NOT NULL,
    "cityOther" TEXT,
    "role" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "branches" INTEGER NOT NULL,
    "posSystem" "LeadPosSystem" NOT NULL,
    "locale" TEXT NOT NULL,
    "consent" BOOLEAN NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_phone_createdAt_idx" ON "Lead"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_status_city_createdAt_idx" ON "Lead"("status", "city", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");
