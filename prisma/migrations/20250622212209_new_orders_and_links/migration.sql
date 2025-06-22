-- CreateTable
CREATE TABLE `UrlMovement` (
    `id` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sessionId` VARCHAR(191) NOT NULL,

    INDEX `UrlMovement_sessionId_idx`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyOrder` (
    `id` VARCHAR(191) NOT NULL,
    `shopifyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `displayFulfillmentStatus` VARCHAR(191) NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `totalPriceAmount` VARCHAR(191) NULL,
    `totalPriceCurrencyCode` VARCHAR(191) NULL,
    `customerEmail` VARCHAR(191) NULL,
    `customerFirstName` VARCHAR(191) NULL,
    `customerLastName` VARCHAR(191) NULL,

    INDEX `ShopifyOrder_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `ShopifyOrder_websiteId_shopifyId_key`(`websiteId`, `shopifyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyOrderLineItem` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `quantity` INTEGER NULL,
    `variantTitle` VARCHAR(191) NULL,
    `variantPrice` VARCHAR(191) NULL,

    INDEX `ShopifyOrderLineItem_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
