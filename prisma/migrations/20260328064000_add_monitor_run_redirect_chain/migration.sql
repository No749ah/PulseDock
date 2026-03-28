-- Migration: add_monitor_run_redirect_chain
ALTER TABLE "MonitorRun" ADD COLUMN "redirectChain" TEXT[] NOT NULL DEFAULT '{}';
