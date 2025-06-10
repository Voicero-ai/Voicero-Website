/*
  Warnings:

  - Added the required column `websiteId` to the `Contact` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Contact` ADD COLUMN `websiteId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `Contact_websiteId_idx` ON `Contact`(`websiteId`);
