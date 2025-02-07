-- CreateTable
CREATE TABLE `Processing` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `batchNo` VARCHAR(191) NOT NULL,
    `processingType` VARCHAR(191) NOT NULL,
    `totalKgs` DOUBLE NOT NULL,
    `grade` ENUM('A', 'B') NOT NULL,
    `startDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `notes` VARCHAR(191) NULL,
    `cwsId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Processing` ADD CONSTRAINT `Processing_cwsId_fkey` FOREIGN KEY (`cwsId`) REFERENCES `CWS`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
