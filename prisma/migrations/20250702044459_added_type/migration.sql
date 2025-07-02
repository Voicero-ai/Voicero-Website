/*
  Warnings:

  - Made the column `type` on table `ShopifyDiscount` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `ShopifyBlogPost` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'general';

-- AlterTable
ALTER TABLE `ShopifyCollection` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'general';

-- AlterTable
ALTER TABLE `ShopifyDiscount` ADD COLUMN `discountType` VARCHAR(191) NULL,
    MODIFY `type` VARCHAR(191) NOT NULL DEFAULT 'general';

-- AlterTable
ALTER TABLE `ShopifyPage` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'general';

-- AlterTable
ALTER TABLE `ShopifyProduct` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'general';
