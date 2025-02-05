/*
  Warnings:

  - The values [CA,CB,NA,NB] on the enum `Purchase_grade` will be removed. If these variants are still used in the database, this will fail.

*/

-- First update existing data
UPDATE Purchase 
SET grade = 'A' 
WHERE grade IN ('CA', 'NA');

UPDATE Purchase 
SET grade = 'B' 
WHERE grade IN ('CB', 'NB');


-- AlterTable
ALTER TABLE `purchase` MODIFY `grade` ENUM('A', 'B') NOT NULL;
