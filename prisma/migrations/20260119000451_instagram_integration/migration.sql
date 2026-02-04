-- CreateTable
CREATE TABLE "public"."InstagramIntegration" (
    "id" TEXT NOT NULL,
    "shopSlug" TEXT NOT NULL,
    "userId" TEXT,
    "accessToken" TEXT NOT NULL,
    "tokenType" TEXT,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "facebookPageId" TEXT,
    "facebookPageName" TEXT,
    "instagramBusinessAccountId" TEXT,

    CONSTRAINT "InstagramIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramIntegration_shopSlug_key" ON "public"."InstagramIntegration"("shopSlug");
