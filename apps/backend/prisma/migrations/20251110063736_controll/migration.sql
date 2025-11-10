-- DropForeignKey
ALTER TABLE "public"."ChatMessage" DROP CONSTRAINT "ChatMessage_recipientId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ChatMessage" DROP CONSTRAINT "ChatMessage_roomId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ChatMessage" DROP CONSTRAINT "ChatMessage_senderId_fkey";

-- AlterTable
ALTER TABLE "ChatMessage" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RoomControlState" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "forcedAudio" BOOLEAN NOT NULL DEFAULT false,
    "forcedVideo" BOOLEAN NOT NULL DEFAULT false,
    "forcedAudioAt" TIMESTAMP(3),
    "forcedVideoAt" TIMESTAMP(3),
    "forcedBy" TEXT,
    "forcedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomControlState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomHostState" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedReason" TEXT,
    "audioForceAll" BOOLEAN NOT NULL DEFAULT false,
    "audioForcedBy" TEXT,
    "audioForcedAt" TIMESTAMP(3),
    "audioForceReason" TEXT,
    "videoForceAll" BOOLEAN NOT NULL DEFAULT false,
    "videoForcedBy" TEXT,
    "videoForcedAt" TIMESTAMP(3),
    "videoForceReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomHostState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomControlState_roomId_idx" ON "RoomControlState"("roomId");

-- CreateIndex
CREATE INDEX "RoomControlState_userId_idx" ON "RoomControlState"("userId");

-- CreateIndex
CREATE INDEX "RoomControlState_forcedBy_idx" ON "RoomControlState"("forcedBy");

-- CreateIndex
CREATE UNIQUE INDEX "RoomControlState_roomId_userId_key" ON "RoomControlState"("roomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomHostState_roomId_key" ON "RoomHostState"("roomId");

-- CreateIndex
CREATE INDEX "RoomHostState_locked_idx" ON "RoomHostState"("locked");

-- CreateIndex
CREATE INDEX "RoomHostState_audioForceAll_idx" ON "RoomHostState"("audioForceAll");

-- CreateIndex
CREATE INDEX "RoomHostState_videoForceAll_idx" ON "RoomHostState"("videoForceAll");

-- AddForeignKey
ALTER TABLE "RoomControlState" ADD CONSTRAINT "RoomControlState_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomControlState" ADD CONSTRAINT "RoomControlState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomHostState" ADD CONSTRAINT "RoomHostState_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
