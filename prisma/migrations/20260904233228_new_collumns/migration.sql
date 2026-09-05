-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "price" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "balance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonusPoints" INTEGER;
