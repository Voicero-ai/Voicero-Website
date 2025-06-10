/*
  Warnings:

  - A unique constraint covering the columns `[stripeSubscriptionId]` on the table `Website` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Website` ADD COLUMN `stripeSubscriptionId` VARCHAR(191) NULL,
    ADD COLUMN `stripeSubscriptionItemId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Website_stripeSubscriptionId_key` ON `Website`(`stripeSubscriptionId`);
