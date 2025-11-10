-- AlterTable
ALTER TABLE "RoomHostState" ADD COLUMN     "chatForceAll" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "chatForceReason" TEXT,
ADD COLUMN     "chatForcedAt" TIMESTAMP(3),
ADD COLUMN     "chatForcedBy" TEXT;

-- CreateIndex
CREATE INDEX "RoomHostState_chatForceAll_idx" ON "RoomHostState"("chatForceAll");
