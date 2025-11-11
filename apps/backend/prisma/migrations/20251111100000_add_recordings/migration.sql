-- Create enums for recording lifecycle
CREATE TYPE "RecordingStatus" AS ENUM ('STARTING', 'RECORDING', 'UPLOADING', 'COMPLETED', 'FAILED');
CREATE TYPE "RecordingAssetType" AS ENUM ('COMPOSITE', 'AUDIO_ONLY', 'VIDEO_ONLY', 'RAW_TRACK', 'METADATA');

-- Create table for recording sessions
CREATE TABLE "RecordingSession" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "roomId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "status" "RecordingStatus" NOT NULL DEFAULT 'STARTING',
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "endedAt" TIMESTAMPTZ,
    "durationSeconds" INTEGER,
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create table for recording assets
CREATE TABLE "RecordingAsset" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "sessionId" TEXT NOT NULL,
    "type" "RecordingAssetType" NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "storageRegion" TEXT,
    "sizeBytes" BIGINT,
    "durationSeconds" INTEGER,
    "format" TEXT,
    "checksum" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "uploadedAt" TIMESTAMPTZ,
    "urlExpiresAt" TIMESTAMPTZ
);

-- Foreign keys
ALTER TABLE "RecordingSession"
    ADD CONSTRAINT "RecordingSession_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE;

ALTER TABLE "RecordingSession"
    ADD CONSTRAINT "RecordingSession_hostId_fkey"
    FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "RecordingAsset"
    ADD CONSTRAINT "RecordingAsset_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "RecordingSession"("id") ON DELETE CASCADE;

-- Indexes to optimize lookups
CREATE INDEX "RecordingSession_roomId_startedAt_idx" ON "RecordingSession" ("roomId", "startedAt");
CREATE INDEX "RecordingSession_hostId_startedAt_idx" ON "RecordingSession" ("hostId", "startedAt");
CREATE INDEX "RecordingAsset_sessionId_idx" ON "RecordingAsset" ("sessionId");
CREATE INDEX "RecordingAsset_storage_idx" ON "RecordingAsset" ("storageBucket", "storageKey");


