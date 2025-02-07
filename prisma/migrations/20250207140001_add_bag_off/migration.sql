-- CreateTable
CREATE TABLE `BaggingOff` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `batchNo` VARCHAR(191) NOT NULL,
    `processingId` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `outputKgs` JSON NOT NULL,
    `totalOutputKgs` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'COMPLETED',
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BaggingOff` ADD CONSTRAINT `BaggingOff_processingId_fkey` FOREIGN KEY (`processingId`) REFERENCES `Processing`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
