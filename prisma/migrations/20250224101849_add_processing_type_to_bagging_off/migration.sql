/*
  Warnings:

  - Added the required column `processingType` to the `BaggingOff` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `baggingoff` ADD COLUMN `processingType` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `user` MODIFY `role` ENUM('ADMIN', 'CWS_MANAGER', 'SUPER_ADMIN', 'SUPERVISOR', 'MD', 'FINANCE', 'OPERATIONS') NOT NULL;
