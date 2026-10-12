-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('ADMIN_LOGIN', 'ADMIN_LOGIN_FAILED', 'ADMIN_PASSWORD_SET', 'USER_APPROVED', 'USER_BLOCKED', 'USER_DELETED', 'ROW_DELETED', 'RUN_ENQUEUED', 'IMPORT_UPLOADED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorLogin" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "target" TEXT,
    "ip" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginFailure" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "LoginFailure_ip_at_idx" ON "LoginFailure"("ip", "at");

-- CreateIndex
CREATE INDEX "LoginFailure_at_idx" ON "LoginFailure"("at");
