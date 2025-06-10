-- CreateTable
CREATE TABLE `Waitlist` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `platform` VARCHAR(191) NULL,

    UNIQUE INDEX `Waitlist_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduledEmail` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `scheduledFor` DATETIME(3) NOT NULL,
    `sent` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContactUs` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `company` VARCHAR(191) NULL,
    `message` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `emailCode` VARCHAR(191) NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `profilePicture` VARCHAR(191) NULL,
    `stripeCustomerId` VARCHAR(191) NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_stripeCustomerId_key`(`stripeCustomerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Website` (
    `id` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `customType` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `renewsOn` DATETIME(3) NULL,
    `plan` VARCHAR(191) NOT NULL,
    `stripeId` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `syncFrequency` VARCHAR(191) NOT NULL DEFAULT 'daily',
    `lastSyncedAt` DATETIME(3) NULL,
    `monthlyQueries` INTEGER NOT NULL DEFAULT 0,
    `queryLimit` INTEGER NOT NULL DEFAULT 1000,
    `aiAssistantId` VARCHAR(191) NULL,
    `aiVoiceAssistantId` VARCHAR(191) NULL,
    `customInstructions` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL DEFAULT '#6366F1',
    `analysis` TEXT NULL,
    `lastAnalysedAt` DATETIME(3) NULL,
    `removeHighlight` BOOLEAN NOT NULL DEFAULT false,
    `customWelcomeMessage` VARCHAR(191) NULL,
    `botName` VARCHAR(191) NULL DEFAULT '',
    `iconBot` VARCHAR(191) NULL DEFAULT 'MessageIcon',
    `iconVoice` VARCHAR(191) NULL DEFAULT 'VoiceIcon',
    `iconMessage` VARCHAR(191) NULL DEFAULT 'MessageIcon',
    `allowAutoCancel` BOOLEAN NOT NULL DEFAULT true,
    `allowAutoReturn` BOOLEAN NOT NULL DEFAULT true,
    `allowAutoExchange` BOOLEAN NOT NULL DEFAULT true,
    `allowAutoClick` BOOLEAN NOT NULL DEFAULT true,
    `allowAutoScroll` BOOLEAN NOT NULL DEFAULT true,
    `allowAutoHighlight` BOOLEAN NOT NULL DEFAULT true,
    `allowAutoRedirect` BOOLEAN NOT NULL DEFAULT true,
    `allowAutoGetUserOrders` BOOLEAN NOT NULL DEFAULT true,
    `allowAutoUpdateUserInfo` BOOLEAN NOT NULL DEFAULT true,
    `allowAutoFillForm` BOOLEAN NOT NULL DEFAULT true,
    `allowAutoTrackOrder` BOOLEAN NOT NULL DEFAULT true,
    `allowAutoLogout` BOOLEAN NOT NULL DEFAULT true,
    `allowAutoLogin` BOOLEAN NOT NULL DEFAULT true,
    `allowAutoGenerateImage` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Website_stripeId_key`(`stripeId`),
    INDEX `Website_userId_idx`(`userId`),
    UNIQUE INDEX `Website_userId_url_type_key`(`userId`, `url`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PopUpQuestion` (
    `id` VARCHAR(191) NOT NULL,
    `question` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `websiteId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccessKey` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `key` VARCHAR(191) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AccessKey_key_key`(`key`),
    INDEX `AccessKey_websiteId_idx`(`websiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VerifiedDevice` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VerifiedDevice_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WordpressPost` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wpId` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `excerpt` TEXT NULL,
    `link` VARCHAR(191) NOT NULL,
    `authorId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `isTraining` BOOLEAN NOT NULL DEFAULT false,
    `trained` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `WordpressPost_wpId_key`(`wpId`),
    INDEX `WordpressPost_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `WordpressPost_slug_websiteId_key`(`slug`, `websiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WordpressPage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wpId` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `link` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `isTraining` BOOLEAN NOT NULL DEFAULT false,
    `trained` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `WordpressPage_wpId_key`(`wpId`),
    INDEX `WordpressPage_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `WordpressPage_slug_websiteId_key`(`slug`, `websiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WordpressProduct` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wpId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `permalink` VARCHAR(191) NOT NULL,
    `price` DOUBLE NOT NULL,
    `regularPrice` DOUBLE NULL,
    `salePrice` DOUBLE NULL,
    `stockQuantity` INTEGER NULL,
    `description` TEXT NOT NULL,
    `shortDescription` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `isTraining` BOOLEAN NOT NULL DEFAULT false,
    `trained` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `WordpressProduct_wpId_key`(`wpId`),
    INDEX `WordpressProduct_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `WordpressProduct_slug_websiteId_key`(`slug`, `websiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WordpressMedia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wpId` INTEGER NOT NULL,
    `title` VARCHAR(191) NULL,
    `caption` VARCHAR(191) NULL,
    `alt` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `description` TEXT NULL,
    `metadata` JSON NULL,
    `mimeType` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `WordpressMedia_wpId_key`(`wpId`),
    INDEX `WordpressMedia_websiteId_idx`(`websiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WordpressAuthor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wpId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `avatarUrl` VARCHAR(191) NULL,
    `bio` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `url` VARCHAR(191) NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,

    UNIQUE INDEX `WordpressAuthor_wpId_key`(`wpId`),
    INDEX `WordpressAuthor_websiteId_idx`(`websiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WordpressCategory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wpId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WordpressCategory_wpId_key`(`wpId`),
    INDEX `WordpressCategory_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `WordpressCategory_slug_websiteId_key`(`slug`, `websiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WordpressTag` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wpId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `WordpressTag_wpId_key`(`wpId`),
    INDEX `WordpressTag_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `WordpressTag_slug_websiteId_key`(`slug`, `websiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WordpressProductCategory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wpId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `count` INTEGER NULL,
    `description` TEXT NULL,
    `imageUrl` VARCHAR(191) NULL,
    `parent` INTEGER NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WordpressProductCategory_wpId_key`(`wpId`),
    INDEX `WordpressProductCategory_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `WordpressProductCategory_slug_websiteId_key`(`slug`, `websiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WordpressProductTag` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wpId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `description` TEXT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WordpressProductTag_wpId_key`(`wpId`),
    INDEX `WordpressProductTag_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `WordpressProductTag_slug_websiteId_key`(`slug`, `websiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WordpressComment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wpId` INTEGER NOT NULL,
    `postId` INTEGER NOT NULL,
    `authorName` VARCHAR(191) NOT NULL,
    `authorEmail` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'approved',
    `parentId` INTEGER NULL,

    UNIQUE INDEX `WordpressComment_wpId_key`(`wpId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WordpressReview` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wpId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `reviewer` VARCHAR(191) NOT NULL,
    `reviewerEmail` VARCHAR(191) NOT NULL,
    `review` TEXT NOT NULL,
    `rating` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `verified` BOOLEAN NOT NULL,

    UNIQUE INDEX `WordpressReview_wpId_key`(`wpId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WordpressCustomField` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `postId` INTEGER NULL,
    `metaKey` VARCHAR(191) NOT NULL,
    `metaValue` TEXT NOT NULL,
    `postType` VARCHAR(191) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `wordpressProductId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WordpressCustomField_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `WordpressCustomField_postId_metaKey_key`(`postId`, `metaKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyProduct` (
    `id` VARCHAR(191) NOT NULL,
    `shopifyId` BIGINT NOT NULL,
    `title` VARCHAR(191) NULL,
    `handle` VARCHAR(191) NULL,
    `vendor` VARCHAR(191) NULL,
    `productType` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `bodyHtml` TEXT NULL,
    `hasOnlyDefaultVariant` BOOLEAN NULL,
    `hasOutOfStockVariants` BOOLEAN NULL,
    `priceRange` JSON NULL,
    `publishedAt` DATETIME(3) NULL,
    `seo` JSON NULL,
    `status` VARCHAR(191) NULL,
    `tags` JSON NULL,
    `totalInventory` INTEGER NULL,
    `tracksInventory` BOOLEAN NULL,
    `scrapedHtml` LONGTEXT NULL,
    `trained` BOOLEAN NULL DEFAULT false,
    `isTraining` BOOLEAN NULL DEFAULT false,

    INDEX `ShopifyProduct_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `ShopifyProduct_websiteId_shopifyId_key`(`websiteId`, `shopifyId`),
    UNIQUE INDEX `ShopifyProduct_websiteId_handle_key`(`websiteId`, `handle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyProductVariant` (
    `id` VARCHAR(191) NOT NULL,
    `shopifyId` BIGINT NOT NULL,
    `title` VARCHAR(191) NULL,
    `price` DOUBLE NULL,
    `sku` VARCHAR(191) NULL,
    `inventory` INTEGER NULL,
    `productId` VARCHAR(191) NOT NULL,
    `compareAtPrice` DOUBLE NULL,
    `inventoryPolicy` VARCHAR(191) NULL,
    `inventoryTracking` BOOLEAN NULL,
    `weight` DOUBLE NULL,
    `weightUnit` VARCHAR(191) NULL,

    UNIQUE INDEX `ShopifyProductVariant_shopifyId_key`(`shopifyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyMedia` (
    `id` VARCHAR(191) NOT NULL,
    `shopifyId` BIGINT NOT NULL,
    `url` VARCHAR(191) NULL,
    `altText` VARCHAR(191) NULL,
    `caption` VARCHAR(191) NULL,
    `productId` VARCHAR(191) NULL,

    UNIQUE INDEX `ShopifyMedia_shopifyId_key`(`shopifyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyReview` (
    `id` VARCHAR(191) NOT NULL,
    `shopifyId` BIGINT NOT NULL,
    `rating` INTEGER NULL,
    `title` VARCHAR(191) NULL,
    `body` TEXT NULL,
    `reviewer` VARCHAR(191) NULL,
    `verified` BOOLEAN NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `productId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `ShopifyReview_shopifyId_key`(`shopifyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyDiscount` (
    `id` VARCHAR(191) NOT NULL,
    `shopifyId` BIGINT NOT NULL,
    `title` VARCHAR(191) NULL,
    `value` VARCHAR(191) NULL,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `appliesTo` VARCHAR(191) NULL,
    `code` VARCHAR(191) NULL,
    `status` VARCHAR(191) NULL DEFAULT 'ACTIVE',
    `type` VARCHAR(191) NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `trained` BOOLEAN NULL DEFAULT false,
    `isTraining` BOOLEAN NULL DEFAULT false,

    INDEX `ShopifyDiscount_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `ShopifyDiscount_websiteId_shopifyId_key`(`websiteId`, `shopifyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyGiftCard` (
    `id` VARCHAR(191) NOT NULL,
    `shopifyId` BIGINT NOT NULL,
    `code` VARCHAR(191) NULL,
    `balance` DOUBLE NULL,
    `currency` VARCHAR(191) NULL,
    `expiresOn` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ShopifyGiftCard_shopifyId_key`(`shopifyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyPage` (
    `id` VARCHAR(191) NOT NULL,
    `shopifyId` BIGINT NOT NULL,
    `title` VARCHAR(191) NULL,
    `handle` VARCHAR(191) NULL,
    `content` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `bodySummary` TEXT NULL,
    `isPublished` BOOLEAN NULL,
    `publishedAt` DATETIME(3) NULL,
    `templateSuffix` VARCHAR(191) NULL,
    `scrapedHtml` LONGTEXT NULL,
    `trained` BOOLEAN NULL DEFAULT false,
    `isTraining` BOOLEAN NULL DEFAULT false,

    INDEX `ShopifyPage_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `ShopifyPage_websiteId_shopifyId_key`(`websiteId`, `shopifyId`),
    UNIQUE INDEX `ShopifyPage_websiteId_handle_key`(`websiteId`, `handle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyBlog` (
    `id` VARCHAR(191) NOT NULL,
    `shopifyId` BIGINT NOT NULL,
    `title` VARCHAR(191) NULL,
    `handle` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `articlesCount` INTEGER NULL,
    `commentPolicy` VARCHAR(191) NULL,
    `feed` JSON NULL,
    `tags` JSON NULL,
    `templateSuffix` VARCHAR(191) NULL,

    INDEX `ShopifyBlog_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `ShopifyBlog_websiteId_shopifyId_key`(`websiteId`, `shopifyId`),
    UNIQUE INDEX `ShopifyBlog_websiteId_handle_key`(`websiteId`, `handle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyBlogPost` (
    `id` VARCHAR(191) NOT NULL,
    `shopifyId` BIGINT NOT NULL,
    `title` VARCHAR(191) NULL,
    `handle` VARCHAR(191) NULL,
    `content` TEXT NULL,
    `author` VARCHAR(191) NULL,
    `image` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `blogId` VARCHAR(191) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `isPublished` BOOLEAN NULL,
    `publishedAt` DATETIME(3) NULL,
    `summary` TEXT NULL,
    `tags` JSON NULL,
    `templateSuffix` VARCHAR(191) NULL,
    `scrapedHtml` LONGTEXT NULL,
    `trained` BOOLEAN NULL DEFAULT false,
    `isTraining` BOOLEAN NULL DEFAULT false,

    INDEX `ShopifyBlogPost_websiteId_idx`(`websiteId`),
    INDEX `ShopifyBlogPost_blogId_idx`(`blogId`),
    UNIQUE INDEX `ShopifyBlogPost_websiteId_shopifyId_key`(`websiteId`, `shopifyId`),
    UNIQUE INDEX `ShopifyBlogPost_websiteId_handle_key`(`websiteId`, `handle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyComment` (
    `id` VARCHAR(191) NOT NULL,
    `shopifyId` BIGINT NOT NULL,
    `body` TEXT NULL,
    `author` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `status` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `postId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiThread` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AiThread_websiteId_idx`(`websiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiMessage` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `pageUrl` VARCHAR(191) NULL,
    `scrollToText` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `type` VARCHAR(191) NULL,

    INDEX `AiMessage_threadId_idx`(`threadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `coreOpen` BOOLEAN NOT NULL DEFAULT false,
    `chooserOpen` BOOLEAN NOT NULL DEFAULT false,
    `textOpen` BOOLEAN NOT NULL DEFAULT false,
    `voiceOpen` BOOLEAN NOT NULL DEFAULT false,
    `voiceOpenWindowUp` BOOLEAN NOT NULL DEFAULT false,
    `textOpenWindowUp` BOOLEAN NOT NULL DEFAULT false,
    `autoMic` BOOLEAN NOT NULL DEFAULT false,
    `textWelcome` BOOLEAN NOT NULL DEFAULT false,
    `voiceWelcome` BOOLEAN NOT NULL DEFAULT false,
    `shopifyCustomerId` VARCHAR(191) NULL,

    INDEX `Session_websiteId_idx`(`websiteId`),
    INDEX `Session_shopifyCustomerId_idx`(`shopifyCustomerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VectorDbConfig` (
    `id` VARCHAR(191) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `MainNamespace` VARCHAR(191) NOT NULL,
    `QANamespace` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `VectorDbConfig_websiteId_key`(`websiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyCollection` (
    `id` VARCHAR(191) NOT NULL,
    `handle` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `ruleSet` JSON NULL,
    `sortOrder` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `websiteId` VARCHAR(191) NOT NULL,
    `image` JSON NULL,
    `shopifyId` BIGINT NOT NULL,
    `scrapedHtml` LONGTEXT NULL,
    `trained` BOOLEAN NULL DEFAULT false,
    `isTraining` BOOLEAN NULL DEFAULT false,

    INDEX `ShopifyCollection_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `ShopifyCollection_websiteId_shopifyId_key`(`websiteId`, `shopifyId`),
    UNIQUE INDEX `ShopifyCollection_websiteId_handle_key`(`websiteId`, `handle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyReportLink` (
    `id` VARCHAR(191) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `reportType` VARCHAR(191) NULL,
    `s3Key` VARCHAR(191) NULL,
    `s3Url` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ShopifyReportLink_websiteId_idx`(`websiteId`),
    UNIQUE INDEX `ShopifyReportLink_websiteId_reportType_key`(`websiteId`, `reportType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyMetafield` (
    `id` VARCHAR(191) NOT NULL,
    `shopifyId` VARCHAR(191) NOT NULL,
    `namespace` VARCHAR(191) NULL,
    `key` VARCHAR(191) NULL,
    `value` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `pageId` VARCHAR(191) NULL,
    `blogId` VARCHAR(191) NULL,
    `postId` VARCHAR(191) NULL,

    INDEX `ShopifyMetafield_websiteId_idx`(`websiteId`),
    INDEX `ShopifyMetafield_pageId_idx`(`pageId`),
    INDEX `ShopifyMetafield_blogId_idx`(`blogId`),
    INDEX `ShopifyMetafield_postId_idx`(`postId`),
    UNIQUE INDEX `ShopifyMetafield_websiteId_shopifyId_key`(`websiteId`, `shopifyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Page` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `html` TEXT NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Page_websiteId_idx`(`websiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Support` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Contact` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `read` BOOLEAN NOT NULL DEFAULT false,
    `replied` BOOLEAN NOT NULL DEFAULT false,
    `threadId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NOT NULL,

    INDEX `Contact_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyCustomer` (
    `id` VARCHAR(191) NOT NULL,
    `shopifyId` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `firstName` VARCHAR(191) NULL,
    `lastName` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `acceptsMarketing` BOOLEAN NULL,
    `tags` JSON NULL,
    `ordersCount` INTEGER NULL,
    `totalSpent` DOUBLE NULL,
    `lastOrderId` VARCHAR(191) NULL,
    `defaultAddressId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `websiteId` VARCHAR(191) NOT NULL,
    `customerData` LONGTEXT NULL,

    INDEX `ShopifyCustomer_websiteId_idx`(`websiteId`),
    INDEX `ShopifyCustomer_defaultAddressId_idx`(`defaultAddressId`),
    UNIQUE INDEX `ShopifyCustomer_websiteId_shopifyId_key`(`websiteId`, `shopifyId`),
    UNIQUE INDEX `ShopifyCustomer_websiteId_email_key`(`websiteId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyCustomerAddress` (
    `id` VARCHAR(191) NOT NULL,
    `addressId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NULL,
    `lastName` VARCHAR(191) NULL,
    `address1` VARCHAR(191) NULL,
    `address2` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `province` VARCHAR(191) NULL,
    `zip` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `isDefault` BOOLEAN NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ShopifyCustomerAddress_customerId_idx`(`customerId`),
    UNIQUE INDEX `ShopifyCustomerAddress_customerId_addressId_key`(`customerId`, `addressId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyCustomerOrder` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `orderNumber` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `processedAt` DATETIME(3) NULL,
    `fulfillmentStatus` VARCHAR(191) NULL,
    `financialStatus` VARCHAR(191) NULL,
    `totalAmount` DOUBLE NULL,
    `currencyCode` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ShopifyCustomerOrder_customerId_idx`(`customerId`),
    UNIQUE INDEX `ShopifyCustomerOrder_customerId_orderId_key`(`customerId`, `orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyCustomerLineItem` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `quantity` INTEGER NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ShopifyCustomerLineItem_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyCustomerFulfillment` (
    `id` VARCHAR(191) NOT NULL,
    `trackingCompany` VARCHAR(191) NULL,
    `trackingNumbers` VARCHAR(191) NULL,
    `trackingUrls` VARCHAR(191) NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ShopifyCustomerFulfillment_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopifyCustomerShippingAddress` (
    `id` VARCHAR(191) NOT NULL,
    `address1` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `province` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `zip` VARCHAR(191) NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ShopifyCustomerShippingAddress_orderId_key`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_WordpressPostToWordpressTag` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_WordpressPostToWordpressTag_AB_unique`(`A`, `B`),
    INDEX `_WordpressPostToWordpressTag_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_WordpressProductToWordpressProductCategory` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_WordpressProductToWordpressProductCategory_AB_unique`(`A`, `B`),
    INDEX `_WordpressProductToWordpressProductCategory_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_WordpressProductToWordpressProductTag` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_WordpressProductToWordpressProductTag_AB_unique`(`A`, `B`),
    INDEX `_WordpressProductToWordpressProductTag_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_WordpressCategoryToWordpressPost` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_WordpressCategoryToWordpressPost_AB_unique`(`A`, `B`),
    INDEX `_WordpressCategoryToWordpressPost_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_AiThreadToSession` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_AiThreadToSession_AB_unique`(`A`, `B`),
    INDEX `_AiThreadToSession_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_ShopifyCollectionToShopifyProduct` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_ShopifyCollectionToShopifyProduct_AB_unique`(`A`, `B`),
    INDEX `_ShopifyCollectionToShopifyProduct_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
