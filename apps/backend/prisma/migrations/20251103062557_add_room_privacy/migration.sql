-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "RoomJoinRequest" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "RoomJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomJoinRequest_roomId_status_idx" ON "RoomJoinRequest"("roomId", "status");

-- CreateIndex
CREATE INDEX "RoomJoinRequest_userId_idx" ON "RoomJoinRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomJoinRequest_roomId_userId_key" ON "RoomJoinRequest"("roomId", "userId");

-- AddForeignKey
ALTER TABLE "RoomJoinRequest" ADD CONSTRAINT "RoomJoinRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomJoinRequest" ADD CONSTRAINT "RoomJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
