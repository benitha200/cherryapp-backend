/*
  Warnings:

  - Added the required column `cherryPrice` to the `Purchase` table without a default value. This is not possible if the table is not empty.
  - Added the required column `commissionFee` to the `Purchase` table without a default value. This is not possible if the table is not empty.
  - Added the required column `transportFee` to the `Purchase` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `purchase` ADD COLUMN `cherryPrice` DOUBLE NOT NULL,
    ADD COLUMN `commissionFee` DOUBLE NOT NULL,
    ADD COLUMN `transportFee` DOUBLE NOT NULL;
