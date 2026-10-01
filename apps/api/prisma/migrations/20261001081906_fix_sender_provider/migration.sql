/*
  Warnings:

  - You are about to drop the column `provider` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Sender" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'ethereal';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "provider";
