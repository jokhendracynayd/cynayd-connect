-- Create new columns to persist participant mute state
ALTER TABLE "Participant"
  ADD COLUMN "audioMuted" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "videoMuted" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "audioMutedAt" TIMESTAMP(3),
  ADD COLUMN "videoMutedAt" TIMESTAMP(3);

