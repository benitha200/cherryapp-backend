/*
  Warnings:

  - Added the required column `batchNo` to the `Purchase` table without a default value. This is not possible if the table is not empty.
  - Added the required column `purchaseDate` to the `Purchase` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `purchase` ADD COLUMN `batchNo` VARCHAR(191) NOT NULL,
    ADD COLUMN `purchaseDate` DATETIME(3) NOT NULL;
