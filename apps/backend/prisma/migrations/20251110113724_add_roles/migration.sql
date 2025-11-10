/*
  Warnings:

  - The `role` column on the `Participant` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('HOST', 'COHOST', 'PARTICIPANT');

-- AlterTable
ALTER TABLE "Participant" DROP COLUMN "role",
ADD COLUMN     "role" "ParticipantRole" NOT NULL DEFAULT 'PARTICIPANT';
