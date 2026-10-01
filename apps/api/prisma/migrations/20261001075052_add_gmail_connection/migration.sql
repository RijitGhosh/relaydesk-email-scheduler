-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gmailConnectedAt" TIMESTAMP(3),
ADD COLUMN     "gmailEmail" TEXT,
ADD COLUMN     "gmailRefreshTokenEnc" TEXT;
