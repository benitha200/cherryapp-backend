-- DropForeignKey
ALTER TABLE `sitecollectionfees` DROP FOREIGN KEY `SiteCollectionFees_siteCollectionId_fkey`;

-- DropIndex
DROP INDEX `SiteCollectionFees_siteCollectionId_fkey` ON `sitecollectionfees`;

-- AddForeignKey
ALTER TABLE `SiteCollectionFees` ADD CONSTRAINT `SiteCollectionFees_siteCollectionId_fkey` FOREIGN KEY (`siteCollectionId`) REFERENCES `SiteCollection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
