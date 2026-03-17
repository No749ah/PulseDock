import { describe, it, expect } from 'vitest';
import { BUILT_IN_CHECKS } from './index';

describe('BUILT_IN_CHECKS registry', () => {
  it('exports a non-empty record', () => {
    expect(typeof BUILT_IN_CHECKS).toBe('object');
    expect(Object.keys(BUILT_IN_CHECKS).length).toBeGreaterThan(0);
  });

  it('contains all expected built-in tool IDs', () => {
    const expectedTools = [
      'proxmox-ve',
      'pfsense',
      'opnsense',
      'unraid',
      'openwrt',
      'truenas-scale',
      'truenas-core',
      'vyos',
      'docker-engine',
      'postgresql',
      'mysql',
      'mariadb',
      'nginx',
      'apache',
      'openssh',
    ];
    for (const toolId of expectedTools) {
      expect(BUILT_IN_CHECKS).toHaveProperty(toolId);
    }
  });

  it('every command is a non-empty string', () => {
    for (const [toolId, cmd] of Object.entries(BUILT_IN_CHECKS)) {
      expect(typeof cmd, `command for ${toolId} should be a string`).toBe('string');
      expect(cmd.trim().length, `command for ${toolId} should not be empty`).toBeGreaterThan(0);
    }
  });

  it('has exactly 15 built-in checks', () => {
    expect(Object.keys(BUILT_IN_CHECKS)).toHaveLength(15);
  });

  it('docker-engine command uses docker version flag', () => {
    expect(BUILT_IN_CHECKS['docker-engine']).toContain('docker version');
  });

  it('nginx command extracts version via nginx -v', () => {
    expect(BUILT_IN_CHECKS['nginx']).toContain('nginx -v');
  });

  it('postgresql command extracts version via psql', () => {
    expect(BUILT_IN_CHECKS['postgresql']).toContain('psql --version');
  });
});
