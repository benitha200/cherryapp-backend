-- AlterTable
ALTER TABLE `user` MODIFY `role` ENUM('ADMIN', 'CWS_MANAGER', 'SUPER_ADMIN') NOT NULL;

-- CreateTable
CREATE TABLE `GlobalFees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `commissionFee` DOUBLE NOT NULL,
    `transportFee` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CWSPricing` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cwsId` INTEGER NOT NULL,
    `gradeAPrice` DOUBLE NOT NULL,
    `transportFee` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteCollectionFees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `siteCollectionId` INTEGER NOT NULL,
    `transportFee` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CWSPricing` ADD CONSTRAINT `CWSPricing_cwsId_fkey` FOREIGN KEY (`cwsId`) REFERENCES `CWS`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SiteCollectionFees` ADD CONSTRAINT `SiteCollectionFees_siteCollectionId_fkey` FOREIGN KEY (`siteCollectionId`) REFERENCES `SiteCollection`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
