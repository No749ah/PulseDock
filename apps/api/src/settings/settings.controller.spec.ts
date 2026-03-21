import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { BackupService } from './backup.service';
import { AuthGuard } from '../common/auth.guard';

const makeSettingsService = () => ({
  getRetention: vi.fn(),
  updateRetention: vi.fn(),
  getStorageStats: vi.fn(),
  getWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
});

const makeBackupService = () => ({
  exportBackup: vi.fn(),
  restoreBackup: vi.fn(),
});

const req = (id = 'user-1') => ({ user: { id } } as never);

describe('SettingsController', () => {
  let controller: SettingsController;
  let settingsSvc: ReturnType<typeof makeSettingsService>;
  let backupSvc: ReturnType<typeof makeBackupService>;

  beforeEach(async () => {
    settingsSvc = makeSettingsService();
    backupSvc = makeBackupService();
    const module = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        { provide: SettingsService, useValue: settingsSvc },
        { provide: BackupService, useValue: backupSvc },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(SettingsController);
  });

  it('getRetention — delegates to service', async () => {
    settingsSvc.getRetention.mockResolvedValue({ retentionDays: 90 });
    const result = await controller.getRetention(req());
    expect(settingsSvc.getRetention).toHaveBeenCalledWith('user-1');
    expect(result).toMatchObject({ retentionDays: 90 });
  });

  it('updateRetention — passes dto to service', async () => {
    settingsSvc.updateRetention.mockResolvedValue({ retentionDays: 30 });
    const dto = { retentionDays: 30 };
    const result = await controller.updateRetention(req(), dto as never);
    expect(settingsSvc.updateRetention).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ retentionDays: 30 });
  });

  it('getStorageStats — delegates to service', async () => {
    settingsSvc.getStorageStats.mockResolvedValue({ rawCount: 1000, rollupCount: 50 });
    const result = await controller.getStorageStats(req());
    expect(settingsSvc.getStorageStats).toHaveBeenCalledWith('user-1');
    expect(result).toMatchObject({ rawCount: 1000 });
  });

  it('exportBackup — sends JSON file response', async () => {
    const doc = { version: '1.0', monitors: [] };
    backupSvc.exportBackup.mockResolvedValue(doc);
    const mockRes = {
      setHeader: vi.fn(),
      send: vi.fn(),
    };
    await controller.exportBackup(req(), mockRes as never);
    expect(backupSvc.exportBackup).toHaveBeenCalledWith('user-1');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('attachment'));
    expect(mockRes.send).toHaveBeenCalledWith(expect.stringContaining('"version"'));
  });

  it('restoreBackup — passes userId and doc to service', async () => {
    backupSvc.restoreBackup.mockResolvedValue({ imported: 5, skipped: 0 });
    const doc = { version: '1.0', monitors: [] };
    const result = await controller.restoreBackup(req(), doc as never);
    expect(backupSvc.restoreBackup).toHaveBeenCalledWith('user-1', doc);
    expect(result).toMatchObject({ imported: 5 });
  });

  it('getWorkspace — delegates to service', async () => {
    settingsSvc.getWorkspace.mockResolvedValue({ workspaceName: 'My Workspace' });
    const result = await controller.getWorkspace(req());
    expect(settingsSvc.getWorkspace).toHaveBeenCalledWith('user-1');
    expect(result).toMatchObject({ workspaceName: 'My Workspace' });
  });

  it('updateWorkspace — passes dto to service', async () => {
    settingsSvc.updateWorkspace.mockResolvedValue({ workspaceName: 'Updated' });
    const dto = { workspaceName: 'Updated' };
    const result = await controller.updateWorkspace(req(), dto as never);
    expect(settingsSvc.updateWorkspace).toHaveBeenCalledWith('user-1', dto);
    expect(result).toMatchObject({ workspaceName: 'Updated' });
  });
});
