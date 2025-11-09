-- Create enum type for chat messages
CREATE TYPE "ChatMessageType" AS ENUM ('BROADCAST', 'DIRECT', 'SYSTEM');

-- Create table for chat messages
CREATE TABLE "ChatMessage" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "roomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT,
    "content" TEXT NOT NULL,
    "messageType" "ChatMessageType" NOT NULL DEFAULT 'BROADCAST',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes to optimize query patterns
CREATE INDEX "ChatMessage_roomId_createdAt_idx" ON "ChatMessage" ("roomId", "createdAt");
CREATE INDEX "ChatMessage_roomId_messageType_idx" ON "ChatMessage" ("roomId", "messageType");
CREATE INDEX "ChatMessage_senderId_createdAt_idx" ON "ChatMessage" ("senderId", "createdAt");
CREATE INDEX "ChatMessage_recipientId_createdAt_idx" ON "ChatMessage" ("recipientId", "createdAt");

-- Foreign key constraints
ALTER TABLE "ChatMessage"
    ADD CONSTRAINT "ChatMessage_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE;

ALTER TABLE "ChatMessage"
    ADD CONSTRAINT "ChatMessage_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE;

ALTER TABLE "ChatMessage"
    ADD CONSTRAINT "ChatMessage_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL;

