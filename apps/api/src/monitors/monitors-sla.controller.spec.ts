import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorsSlaController } from './monitors-sla.controller';

function makeReq(userId = 'user-1') {
  return { user: { id: userId } };
}

function makeSlaService() {
  return {
    slaDashboard: vi.fn(),
    slaByTag: vi.fn(),
    slaComplianceReport: vi.fn(),
    getSloReport: vi.fn(),
    getSloSummary: vi.fn(),
    slaBudgetForecast: vi.fn(),
    getErrorBudget: vi.fn(),
    uptimeCertificate: vi.fn(),
    generateUptimeCertificate: vi.fn(),
  };
}

function makeRes() {
  return {
    setHeader: vi.fn(),
    send: vi.fn(),
  } as unknown as import('express').Response;
}

describe('MonitorsSlaController', () => {
  let controller: MonitorsSlaController;
  let service: ReturnType<typeof makeSlaService>;

  beforeEach(() => {
    service = makeSlaService();
    controller = new MonitorsSlaController(service as never);
  });

  // ─── slaDashboard ────────────────────────────────────────────────────────

  it('slaDashboard() delegates to slaService', async () => {
    service.slaDashboard.mockResolvedValue({ monitors: [], overall: {} });
    const result = await controller.slaDashboard(makeReq());
    expect(service.slaDashboard).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ monitors: [], overall: {} });
  });

  // ─── slaByTag ────────────────────────────────────────────────────────────

  it('slaByTag() delegates to slaService', async () => {
    service.slaByTag.mockResolvedValue([{ tag: 'prod', uptimePct: 99.9 }]);
    const result = await controller.slaByTag(makeReq()) as unknown[];
    expect(service.slaByTag).toHaveBeenCalledWith('user-1');
    expect(result).toHaveLength(1);
  });

  // ─── slaComplianceReport ────────────────────────────────────────────────

  it('slaComplianceReport() defaults to 3 months', async () => {
    service.slaComplianceReport.mockResolvedValue({ months: [] });
    await controller.slaComplianceReport(makeReq());
    expect(service.slaComplianceReport).toHaveBeenCalledWith('user-1', 3);
  });

  it('slaComplianceReport() passes valid months', async () => {
    service.slaComplianceReport.mockResolvedValue({ months: [] });
    await controller.slaComplianceReport(makeReq(), '6');
    expect(service.slaComplianceReport).toHaveBeenCalledWith('user-1', 6);
  });

  it('slaComplianceReport() clamps to 12 months max', async () => {
    service.slaComplianceReport.mockResolvedValue({});
    await controller.slaComplianceReport(makeReq(), '99');
    expect(service.slaComplianceReport).toHaveBeenCalledWith('user-1', 12);
  });

  it('slaComplianceReport() falls back to 3 for 0 (falsy parse)', async () => {
    service.slaComplianceReport.mockResolvedValue({});
    // parseInt('0') || 3 === 3 because 0 is falsy
    await controller.slaComplianceReport(makeReq(), '0');
    expect(service.slaComplianceReport).toHaveBeenCalledWith('user-1', 3);
  });

  it('slaComplianceReport() defaults to 3 for invalid input', async () => {
    service.slaComplianceReport.mockResolvedValue({});
    await controller.slaComplianceReport(makeReq(), 'bad');
    expect(service.slaComplianceReport).toHaveBeenCalledWith('user-1', 3);
  });

  // ─── getSloReport ────────────────────────────────────────────────────────

  it('getSloReport() delegates to slaService', async () => {
    service.getSloReport.mockResolvedValue({ slo: 99.9 });
    const result = await controller.getSloReport(makeReq(), 'm-1');
    expect(service.getSloReport).toHaveBeenCalledWith('user-1', 'm-1');
    expect(result).toEqual({ slo: 99.9 });
  });

  // ─── getSloSummary ───────────────────────────────────────────────────────

  it('getSloSummary() delegates to slaService', async () => {
    service.getSloSummary.mockResolvedValue([]);
    await controller.getSloSummary(makeReq());
    expect(service.getSloSummary).toHaveBeenCalledWith('user-1');
  });

  // ─── slaBudgetForecast ───────────────────────────────────────────────────

  it('slaBudgetForecast() delegates to slaService', async () => {
    service.slaBudgetForecast.mockResolvedValue({ projectedUptime: 99.8, willBreach: false });
    const result = await controller.slaBudgetForecast(makeReq(), 'm-1') as Record<string, unknown>;
    expect(service.slaBudgetForecast).toHaveBeenCalledWith('user-1', 'm-1');
    expect(result['willBreach']).toBe(false);
  });

  // ─── errorBudget ─────────────────────────────────────────────────────────

  it('errorBudget() delegates with parsed slaTarget and period', async () => {
    service.getErrorBudget.mockResolvedValue({ remaining: 0.5 });
    await controller.errorBudget(makeReq(), 'm-1', '99.5', '7d');
    expect(service.getErrorBudget).toHaveBeenCalledWith('m-1', 'user-1', { slaTarget: 99.5, period: '7d' });
  });

  it('errorBudget() defaults slaTarget to 99.9 and period to 30d when missing', async () => {
    service.getErrorBudget.mockResolvedValue({});
    await controller.errorBudget(makeReq(), 'm-1');
    expect(service.getErrorBudget).toHaveBeenCalledWith('m-1', 'user-1', { slaTarget: 99.9, period: '30d' });
  });

  it('errorBudget() defaults slaTarget to 99.9 for non-numeric input', async () => {
    service.getErrorBudget.mockResolvedValue({});
    await controller.errorBudget(makeReq(), 'm-1', 'notanumber', '30d');
    expect(service.getErrorBudget).toHaveBeenCalledWith('m-1', 'user-1', { slaTarget: 99.9, period: '30d' });
  });

  it('errorBudget() defaults slaTarget to 99.9 when value is 0', async () => {
    service.getErrorBudget.mockResolvedValue({});
    await controller.errorBudget(makeReq(), 'm-1', '0', '30d');
    expect(service.getErrorBudget).toHaveBeenCalledWith('m-1', 'user-1', { slaTarget: 99.9, period: '30d' });
  });

  it('errorBudget() falls back to 30d for invalid period format', async () => {
    service.getErrorBudget.mockResolvedValue({});
    await controller.errorBudget(makeReq(), 'm-1', '99.9', 'bad-period');
    expect(service.getErrorBudget).toHaveBeenCalledWith('m-1', 'user-1', { slaTarget: 99.9, period: '30d' });
  });

  // ─── uptimeCertificate ───────────────────────────────────────────────────

  it('uptimeCertificate() sends HTML content', async () => {
    service.uptimeCertificate.mockResolvedValue('<html>cert</html>');
    const res = makeRes();
    await controller.uptimeCertificate(makeReq(), 'm-1', res, '1');
    expect(service.uptimeCertificate).toHaveBeenCalledWith('user-1', 'm-1', 1);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(res.send).toHaveBeenCalledWith('<html>cert</html>');
  });

  it('uptimeCertificate() defaults to 1 month', async () => {
    service.uptimeCertificate.mockResolvedValue('<html/>');
    const res = makeRes();
    await controller.uptimeCertificate(makeReq(), 'm-1', res, undefined);
    expect(service.uptimeCertificate).toHaveBeenCalledWith('user-1', 'm-1', 1);
  });

  it('uptimeCertificate() supports 3, 6, 12 months', async () => {
    service.uptimeCertificate.mockResolvedValue('<html/>');
    const res = makeRes();
    for (const months of ['3', '6', '12']) {
      await controller.uptimeCertificate(makeReq(), 'm-1', res, months);
      expect(service.uptimeCertificate).toHaveBeenCalledWith('user-1', 'm-1', parseInt(months));
    }
  });

  it('uptimeCertificate() defaults to 1 for invalid months', async () => {
    service.uptimeCertificate.mockResolvedValue('<html/>');
    const res = makeRes();
    await controller.uptimeCertificate(makeReq(), 'm-1', res, '99');
    expect(service.uptimeCertificate).toHaveBeenCalledWith('user-1', 'm-1', 1);
  });

  // ─── uptimeCertificateData ───────────────────────────────────────────────

  it('uptimeCertificateData() delegates with periodDays', async () => {
    service.generateUptimeCertificate.mockResolvedValue({ certId: 'cert-1' });
    const result = await controller.uptimeCertificateData(makeReq(), 'm-1', '30') as Record<string, unknown>;
    expect(service.generateUptimeCertificate).toHaveBeenCalledWith('user-1', 'm-1', { periodDays: 30, title: undefined });
    expect(result['certId']).toBe('cert-1');
  });

  it('uptimeCertificateData() passes custom title', async () => {
    service.generateUptimeCertificate.mockResolvedValue({});
    await controller.uptimeCertificateData(makeReq(), 'm-1', '30', 'My Certificate');
    expect(service.generateUptimeCertificate).toHaveBeenCalledWith('user-1', 'm-1', { periodDays: 30, title: 'My Certificate' });
  });

  it('uptimeCertificateData() defaults to 30 days for invalid periodDays', async () => {
    service.generateUptimeCertificate.mockResolvedValue({});
    await controller.uptimeCertificateData(makeReq(), 'm-1', '45');
    expect(service.generateUptimeCertificate).toHaveBeenCalledWith('user-1', 'm-1', { periodDays: 30, title: undefined });
  });

  // ─── user isolation ─────────────────────────────────────────────────────

  it('all calls use userId from request', async () => {
    service.slaDashboard.mockResolvedValue({});
    await controller.slaDashboard({ user: { id: 'user-42' } });
    expect(service.slaDashboard).toHaveBeenCalledWith('user-42');
  });
});
