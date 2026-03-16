import { describe, it, expect } from 'vitest';
import { BootstrapService } from './bootstrap.service';

describe('BootstrapService', () => {
  describe('onModuleInit()', () => {
    it('is a no-op (setup is handled via POST /v1/auth/setup)', async () => {
      const service = new BootstrapService();
      // Should complete without error
      await service.onModuleInit();
    });
  });
});
