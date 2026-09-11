-- CreateIndex
CREATE INDEX "Monitor_userId_idx" ON "Monitor"("userId");

-- CreateIndex
CREATE INDEX "Monitor_enabled_idx" ON "Monitor"("enabled");

-- CreateIndex
CREATE INDEX "Monitor_userId_enabled_idx" ON "Monitor"("userId", "enabled");

-- CreateIndex
CREATE INDEX "MonitorRun_userId_checkedAt_idx" ON "MonitorRun"("userId", "checkedAt");

-- CreateIndex
CREATE INDEX "MonitorRun_checkedAt_idx" ON "MonitorRun"("checkedAt");
