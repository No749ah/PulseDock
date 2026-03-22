import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Test } from '@nestjs/testing'
import { GrafanaController } from './grafana.controller'
import { GrafanaService } from './grafana.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

const makeGrafanaService = () => ({
  search: vi.fn(),
  query: vi.fn(),
  annotations: vi.fn(),
  tagValues: vi.fn(),
})

const req = (id = 'user-1') => ({ user: { id } } as never)

describe('GrafanaController', () => {
  let controller: GrafanaController
  let svc: ReturnType<typeof makeGrafanaService>

  beforeEach(async () => {
    svc = makeGrafanaService()
    const module = await Test.createTestingModule({
      controllers: [GrafanaController],
      providers: [{ provide: GrafanaService, useValue: svc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile()
    controller = module.get(GrafanaController)
  })

  describe('health', () => {
    it('returns OK string', () => {
      expect(controller.health()).toBe('OK')
    })
  })

  describe('search', () => {
    it('delegates to service with userId and empty target', async () => {
      const targets = ['monitor:abc:uptime', 'monitor:abc:latency']
      svc.search.mockResolvedValue(targets)
      const result = await controller.search(req(), {})
      expect(svc.search).toHaveBeenCalledWith('user-1', '')
      expect(result).toEqual(targets)
    })

    it('passes target filter to service', async () => {
      svc.search.mockResolvedValue(['monitor:abc:uptime'])
      const result = await controller.search(req(), { target: 'uptime' })
      expect(svc.search).toHaveBeenCalledWith('user-1', 'uptime')
      expect(result).toHaveLength(1)
    })
  })

  describe('query', () => {
    it('returns timeseries results', async () => {
      const results = [{ target: 'uptime', datapoints: [[99.9, 1234567890000]] }]
      svc.query.mockResolvedValue(results)
      const body = {
        range: { from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' },
        intervalMs: 60000,
        maxDataPoints: 100,
        targets: [{ target: 'monitor:abc:uptime', type: 'timeserie' as const }],
      }
      const result = await controller.query(req(), body)
      expect(svc.query).toHaveBeenCalledWith('user-1', body)
      expect(result).toEqual(results)
    })

    it('returns table results', async () => {
      const results = [{ columns: [{ text: 'Monitor' }], rows: [['My Monitor']], type: 'table' }]
      svc.query.mockResolvedValue(results)
      const body = {
        range: { from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' },
        intervalMs: 3600000,
        maxDataPoints: 50,
        targets: [{ target: 'summary', type: 'table' as const }],
      }
      const result = await controller.query(req(), body)
      expect(result).toEqual(results)
    })
  })

  describe('annotations', () => {
    it('returns annotation events', async () => {
      const annotations = [
        { title: 'Outage', time: 1234567890000, text: 'Service down', tags: ['incident'] },
      ]
      svc.annotations.mockResolvedValue(annotations)
      const body = {
        annotation: { name: 'incidents', enable: true },
        range: { from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' },
      }
      const result = await controller.annotations(req(), body)
      expect(svc.annotations).toHaveBeenCalledWith('user-1', body)
      expect(result).toEqual(annotations)
    })

    it('returns empty array when no events', async () => {
      svc.annotations.mockResolvedValue([])
      const body = {
        annotation: { name: 'incidents', enable: false },
        range: { from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' },
      }
      const result = await controller.annotations(req(), body)
      expect(result).toEqual([])
    })
  })

  describe('tagKeys', () => {
    it('returns predefined tag keys', () => {
      const result = controller.tagKeys()
      expect(result).toContainEqual({ type: 'string', text: 'monitor' })
      expect(result).toContainEqual({ type: 'string', text: 'type' })
      expect(result).toContainEqual({ type: 'string', text: 'status' })
    })
  })

  describe('tagValues', () => {
    it('delegates to service with userId and key', async () => {
      const values = [{ text: 'HTTP' }, { text: 'TCP' }]
      svc.tagValues.mockResolvedValue(values)
      const result = await controller.tagValues(req(), { key: 'type' })
      expect(svc.tagValues).toHaveBeenCalledWith('user-1', 'type')
      expect(result).toEqual(values)
    })

    it('returns monitor name values', async () => {
      const values = [{ text: 'My API' }, { text: 'My Web' }]
      svc.tagValues.mockResolvedValue(values)
      const result = await controller.tagValues(req(), { key: 'monitor' })
      expect(result).toHaveLength(2)
    })
  })
})
