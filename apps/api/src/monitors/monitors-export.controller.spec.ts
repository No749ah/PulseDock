import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsExportController } from './monitors-export.controller';

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

function makeExportService() {
  return {
    exportMonitorsConfig: vi.fn(),
    importMonitors: vi.fn(),
    importMonitorsConfig: vi.fn(),
    importExternal: vi.fn(),
    importFromCompose: vi.fn(),
    previewFromOpenApi: vi.fn(),
    importFromOpenApi: vi.fn(),
  };
}

function makeRes() {
  return {
    setHeader: vi.fn(),
    send: vi.fn(),
  } as unknown as import('express').Response;
}

describe('MonitorsExportController', () => {
  let controller: MonitorsExportController;
  let service: ReturnType<typeof makeExportService>;

  beforeEach(() => {
    service = makeExportService();
    controller = new MonitorsExportController(service as never);
  });

  // ─── exportMonitorsConfig ─────────────────────────────────────────────────

  it('exportMonitorsConfig() sends JSON with correct headers', async () => {
    service.exportMonitorsConfig.mockResolvedValue({
      content: '{"version":1}',
      contentType: 'application/json',
      filename: 'pulsedock-monitors.json',
    });
    const res = makeRes();
    await controller.exportMonitorsConfig(makeReq(), res, 'json', undefined, undefined);
    expect(service.exportMonitorsConfig).toHaveBeenCalledWith('user-1', { format: 'json', ids: undefined, includeAlertChannels: false });
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="pulsedock-monitors.json"');
    expect(res.send).toHaveBeenCalledWith('{"version":1}');
  });

  it('exportMonitorsConfig() handles yaml format', async () => {
    service.exportMonitorsConfig.mockResolvedValue({
      content: 'version: 1',
      contentType: 'application/yaml',
      filename: 'pulsedock-monitors.yaml',
    });
    const res = makeRes();
    await controller.exportMonitorsConfig(makeReq(), res, 'yaml', undefined, undefined);
    expect(service.exportMonitorsConfig).toHaveBeenCalledWith('user-1', expect.objectContaining({ format: 'yaml' }));
  });

  it('exportMonitorsConfig() splits ids by comma', async () => {
    service.exportMonitorsConfig.mockResolvedValue({ content: '{}', contentType: 'application/json', filename: 'f.json' });
    const res = makeRes();
    await controller.exportMonitorsConfig(makeReq(), res, 'json', 'm-1,m-2', undefined);
    expect(service.exportMonitorsConfig).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ ids: ['m-1', 'm-2'] }),
    );
  });

  it('exportMonitorsConfig() parses includeAlertChannels=true', async () => {
    service.exportMonitorsConfig.mockResolvedValue({ content: '{}', contentType: 'application/json', filename: 'f.json' });
    const res = makeRes();
    await controller.exportMonitorsConfig(makeReq(), res, 'json', undefined, 'true');
    expect(service.exportMonitorsConfig).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ includeAlertChannels: true }),
    );
  });

  it('exportMonitorsConfig() sets Cache-Control: no-cache', async () => {
    service.exportMonitorsConfig.mockResolvedValue({ content: '{}', contentType: 'application/json', filename: 'f.json' });
    const res = makeRes();
    await controller.exportMonitorsConfig(makeReq(), res);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
  });

  // ─── importMonitors ───────────────────────────────────────────────────────

  it('importMonitors() delegates to exportService.importMonitors', async () => {
    service.importMonitors.mockResolvedValue({ imported: 2, errors: [] });
    const result = await controller.importMonitors(makeReq(), { monitors: [] }) as Record<string, unknown>;
    expect(service.importMonitors).toHaveBeenCalledWith('user-1', []);
    expect(result['imported']).toBe(2);
  });

  it('importMonitors() passes monitor array correctly', async () => {
    const monitors = [{ name: 'A', target: 'https://a.com', type: 'HTTP' }] as never[];
    service.importMonitors.mockResolvedValue({ imported: 1, errors: [] });
    await controller.importMonitors(makeReq(), { monitors });
    expect(service.importMonitors).toHaveBeenCalledWith('user-1', monitors);
  });

  // ─── importMonitorsConfig ─────────────────────────────────────────────────

  it('importMonitorsConfig() delegates with json format', async () => {
    service.importMonitorsConfig.mockResolvedValue({ imported: 3, dryRun: false });
    const body = { format: 'json', content: '{}', dryRun: false, overwriteExisting: false };
    const result = await controller.importMonitorsConfig(makeReq(), body) as Record<string, unknown>;
    expect(service.importMonitorsConfig).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ format: 'json', content: '{}', dryRun: false, overwriteExisting: false }),
    );
    expect(result['imported']).toBe(3);
  });

  it('importMonitorsConfig() defaults dryRun and overwriteExisting to false', async () => {
    service.importMonitorsConfig.mockResolvedValue({ imported: 0 });
    const body = { format: 'json', content: '{}' } as never;
    await controller.importMonitorsConfig(makeReq(), body);
    expect(service.importMonitorsConfig).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ dryRun: false, overwriteExisting: false }),
    );
  });

  // ─── importExternal ───────────────────────────────────────────────────────

  it('importExternal() delegates to exportService.importExternal', async () => {
    service.importExternal.mockResolvedValue({ imported: 5, skipped: 1, errors: [] });
    const body = { source: 'uptime-robot' as const, payload: {} };
    const result = await controller.importExternal(makeReq(), body) as Record<string, unknown>;
    expect(service.importExternal).toHaveBeenCalledWith('user-1', 'uptime-robot', {});
    expect(result['imported']).toBe(5);
    expect(result['skipped']).toBe(1);
  });

  // ─── importFromCompose ────────────────────────────────────────────────────

  it('importFromCompose() delegates to exportService.importFromCompose', async () => {
    service.importFromCompose.mockResolvedValue([{ name: 'app', target: 'http://app:3000' }]);
    const result = await controller.importFromCompose(makeReq(), { compose: 'version: "3"' }) as unknown[];
    expect(service.importFromCompose).toHaveBeenCalledWith('version: "3"');
    expect(result).toHaveLength(1);
  });

  // ─── importFromOpenApiPreview ─────────────────────────────────────────────

  it('importFromOpenApiPreview() delegates to exportService.previewFromOpenApi', async () => {
    service.previewFromOpenApi.mockResolvedValue([]);
    const body = { url: 'https://api.example.com/openapi.json', baseUrl: 'https://api.example.com' };
    await controller.importFromOpenApiPreview(makeReq(), body);
    expect(service.previewFromOpenApi).toHaveBeenCalledWith(body);
  });

  // ─── importFromOpenApi ────────────────────────────────────────────────────

  it('importFromOpenApi() delegates to exportService.importFromOpenApi', async () => {
    service.importFromOpenApi.mockResolvedValue({ created: 3, errors: [] });
    const body = { url: 'https://api.example.com/openapi.json', selectedPaths: ['/users'] };
    const result = await controller.importFromOpenApi(makeReq(), body as never) as Record<string, unknown>;
    expect(service.importFromOpenApi).toHaveBeenCalledWith('user-1', body);
    expect(result['created']).toBe(3);
  });
});
