-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "item" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "snippet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Purchase_userId_at_idx" ON "Purchase"("userId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_userId_source_sourceRef_key" ON "Purchase"("userId", "source", "sourceRef");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
