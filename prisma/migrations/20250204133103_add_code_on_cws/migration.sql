/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `CWS` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `cws` ADD COLUMN `code` VARCHAR(191) NOT NULL DEFAULT 'MSH';

-- CreateIndex
CREATE UNIQUE INDEX `CWS_code_key` ON `CWS`(`code`);
