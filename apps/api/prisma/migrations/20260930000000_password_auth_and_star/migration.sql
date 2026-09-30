-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT,
ALTER COLUMN "googleId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ScheduledEmail" ADD COLUMN     "starred" BOOLEAN NOT NULL DEFAULT false;
