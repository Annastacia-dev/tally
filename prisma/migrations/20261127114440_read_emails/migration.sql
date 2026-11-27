-- CreateTable
CREATE TABLE "ReadEmail" (
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadEmail_pkey" PRIMARY KEY ("userId","messageId")
);

-- AddForeignKey
ALTER TABLE "ReadEmail" ADD CONSTRAINT "ReadEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
