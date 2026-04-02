import { describe, it, expect } from 'vitest';
import { buildConfig } from './useAlerts';

describe('buildConfig', () => {
  describe('discord', () => {
    it('builds minimal config with just webhookUrl', () => {
      const cfg = buildConfig('discord', 'https://discord.com/webhook/123', '');
      expect(cfg).toEqual({ webhookUrl: 'https://discord.com/webhook/123' });
    });

    it('includes username when provided', () => {
      const cfg = buildConfig('discord', 'https://discord.com/webhook/123', '', undefined, { username: 'PulseDock' });
      expect(cfg.username).toBe('PulseDock');
    });

    it('includes avatarUrl when provided', () => {
      const cfg = buildConfig('discord', 'https://discord.com/webhook/123', '', undefined, { avatarUrl: 'https://example.com/avatar.png' });
      expect(cfg.avatarUrl).toBe('https://example.com/avatar.png');
    });

    it('includes mentionRoleId and mentionUserId when provided', () => {
      const cfg = buildConfig('discord', 'https://discord.com/webhook/123', '', undefined, {
        mentionRoleId: 'role123',
        mentionUserId: 'user456',
      });
      expect(cfg.mentionRoleId).toBe('role123');
      expect(cfg.mentionUserId).toBe('user456');
    });

    it('includes messageTemplate when provided', () => {
      const cfg = buildConfig('discord', 'https://discord.com/webhook/123', '', undefined, { messageTemplate: 'Alert: {{monitor.name}}' });
      expect(cfg.messageTemplate).toBe('Alert: {{monitor.name}}');
    });

    it('omits empty optional fields', () => {
      const cfg = buildConfig('discord', 'https://discord.com/webhook/123', '', undefined, {
        username: '  ',
        avatarUrl: '',
        mentionRoleId: '',
        mentionUserId: '',
        messageTemplate: '  ',
      });
      expect(cfg.username).toBeUndefined();
      expect(cfg.avatarUrl).toBeUndefined();
      expect(cfg.mentionRoleId).toBeUndefined();
      expect(cfg.mentionUserId).toBeUndefined();
      expect(cfg.messageTemplate).toBeUndefined();
    });
  });

  describe('slack', () => {
    it('builds config with webhookUrl', () => {
      const cfg = buildConfig('slack', 'https://hooks.slack.com/services/123', '');
      expect(cfg).toEqual({ webhookUrl: 'https://hooks.slack.com/services/123' });
    });
  });

  describe('webhook', () => {
    it('builds config with url', () => {
      const cfg = buildConfig('webhook', 'https://example.com/hook', '');
      expect(cfg).toEqual({ url: 'https://example.com/hook' });
    });

    it('includes secret when provided', () => {
      const cfg = buildConfig('webhook', 'https://example.com/hook', '', 'my-secret');
      expect(cfg.secret).toBe('my-secret');
    });

    it('omits empty secret', () => {
      const cfg = buildConfig('webhook', 'https://example.com/hook', '', '  ');
      expect(cfg.secret).toBeUndefined();
    });

    it('includes payloadTemplate when provided', () => {
      const cfg = buildConfig('webhook', 'https://example.com/hook', '', undefined, { payloadTemplate: '{"msg":"{{text}}"}' });
      expect(cfg.payloadTemplate).toBe('{"msg":"{{text}}"}');
    });

    it('includes customHeaders when provided', () => {
      const cfg = buildConfig('webhook', 'https://example.com/hook', '', undefined, {
        customHeaders: [{ key: 'X-Token', value: 'abc123' }, { key: 'X-Source', value: 'pulsedock' }],
      });
      expect(cfg.customHeaders).toEqual({ 'X-Token': 'abc123', 'X-Source': 'pulsedock' });
    });

    it('skips empty header keys', () => {
      const cfg = buildConfig('webhook', 'https://example.com/hook', '', undefined, {
        customHeaders: [{ key: '', value: 'ignored' }, { key: 'X-Valid', value: 'yes' }],
      });
      expect(cfg.customHeaders).toEqual({ 'X-Valid': 'yes' });
    });

    it('omits customHeaders when array is empty', () => {
      const cfg = buildConfig('webhook', 'https://example.com/hook', '', undefined, { customHeaders: [] });
      expect(cfg.customHeaders).toBeUndefined();
    });
  });

  describe('telegram', () => {
    it('builds config with botToken and chatId', () => {
      const cfg = buildConfig('telegram', 'bot:TOKEN', '-100123456');
      expect(cfg).toEqual({ botToken: 'bot:TOKEN', chatId: '-100123456', parseMode: undefined });
    });

    it('includes parseMode when provided', () => {
      const cfg = buildConfig('telegram', 'bot:TOKEN', '-100123456', undefined, { parseMode: 'Markdown' });
      expect(cfg.parseMode).toBe('Markdown');
    });
  });

  describe('pagerduty', () => {
    it('builds config with integrationKey', () => {
      const cfg = buildConfig('pagerduty', 'pd-integration-key', '');
      expect(cfg).toEqual({ integrationKey: 'pd-integration-key' });
    });
  });

  describe('opsgenie', () => {
    it('builds config with apiKey and region', () => {
      const cfg = buildConfig('opsgenie', 'og-api-key', 'eu');
      expect(cfg).toEqual({ apiKey: 'og-api-key', region: 'eu' });
    });

    it('defaults region to us when b is empty', () => {
      const cfg = buildConfig('opsgenie', 'og-api-key', '');
      expect(cfg.region).toBe('us');
    });
  });

  describe('sms', () => {
    it('builds config with twilio fields', () => {
      const cfg = buildConfig('sms', 'account-sid', '+15551234567', 'auth-token', { username: '+15559876543' });
      expect(cfg).toEqual({
        accountSid: 'account-sid',
        authToken: 'auth-token',
        from: '+15551234567',
        to: '+15559876543',
      });
    });

    it('uses empty string for missing authToken', () => {
      const cfg = buildConfig('sms', 'account-sid', '+15551234567', undefined, { username: '+15559876543' });
      expect(cfg.authToken).toBe('');
    });
  });

  describe('teams', () => {
    it('builds config with webhookUrl', () => {
      const cfg = buildConfig('teams', 'https://outlook.office.com/webhook/123', '');
      expect(cfg).toEqual({ webhookUrl: 'https://outlook.office.com/webhook/123' });
    });
  });

  describe('ntfy', () => {
    it('builds config with topicUrl only when token is empty', () => {
      const cfg = buildConfig('ntfy', 'https://ntfy.sh/mytopic', '');
      expect(cfg.topicUrl).toBe('https://ntfy.sh/mytopic');
      expect(cfg.token).toBeUndefined();
    });

    it('includes token when provided', () => {
      const cfg = buildConfig('ntfy', 'https://ntfy.sh/mytopic', 'my-access-token');
      expect(cfg.token).toBe('my-access-token');
    });
  });

  describe('gotify', () => {
    it('builds config with serverUrl and appToken', () => {
      const cfg = buildConfig('gotify', 'https://gotify.example.com', 'app-token');
      expect(cfg).toMatchObject({ serverUrl: 'https://gotify.example.com', appToken: 'app-token' });
    });

    it('parses priority from secret', () => {
      const cfg = buildConfig('gotify', 'https://gotify.example.com', 'app-token', '8');
      expect(cfg.priority).toBe(8);
    });

    it('defaults priority to 5 when secret is not a valid number', () => {
      const cfg = buildConfig('gotify', 'https://gotify.example.com', 'app-token', 'NaN');
      expect(cfg.priority).toBe(5);
    });
  });

  describe('matrix', () => {
    it('builds config with homeserverUrl, accessToken, and roomId', () => {
      const cfg = buildConfig('matrix', 'https://matrix.org', 'access-token', '!room:matrix.org');
      expect(cfg).toEqual({
        homeserverUrl: 'https://matrix.org',
        accessToken: 'access-token',
        roomId: '!room:matrix.org',
      });
    });

    it('uses empty string for missing roomId', () => {
      const cfg = buildConfig('matrix', 'https://matrix.org', 'access-token');
      expect(cfg.roomId).toBe('');
    });
  });

  describe('rocketchat', () => {
    it('builds config with webhookUrl', () => {
      const cfg = buildConfig('rocketchat', 'https://rocket.example.com/hooks/123', '');
      expect(cfg).toEqual({ webhookUrl: 'https://rocket.example.com/hooks/123' });
    });
  });

  describe('apprise', () => {
    it('builds config with serverUrl only', () => {
      const cfg = buildConfig('apprise', 'http://apprise.example.com', '');
      expect(cfg).toMatchObject({ serverUrl: 'http://apprise.example.com' });
      expect(cfg.tag).toBeUndefined();
    });

    it('includes tag when provided', () => {
      const cfg = buildConfig('apprise', 'http://apprise.example.com', 'my-tag');
      expect(cfg.tag).toBe('my-tag');
    });
  });

  describe('mattermost', () => {
    it('builds config with webhookUrl', () => {
      const cfg = buildConfig('mattermost', 'https://mattermost.example.com/hooks/123', '');
      expect(cfg).toMatchObject({ webhookUrl: 'https://mattermost.example.com/hooks/123' });
    });

    it('includes channel when provided', () => {
      const cfg = buildConfig('mattermost', 'https://mattermost.example.com/hooks/123', 'general');
      expect(cfg.channel).toBe('general');
    });

    it('includes username from secret', () => {
      const cfg = buildConfig('mattermost', 'https://mattermost.example.com/hooks/123', 'general', 'pulsedock-bot');
      expect(cfg.username).toBe('pulsedock-bot');
    });
  });

  describe('zulip', () => {
    it('builds config with stream messageType by default', () => {
      const cfg = buildConfig('zulip', 'https://zulip.example.com', 'bot@example.com', 'api-key', {
        mentionRoleId: 'stream',
        username: 'general',
        avatarUrl: 'deploy-alerts',
      });
      expect(cfg).toMatchObject({
        serverUrl: 'https://zulip.example.com',
        botEmail: 'bot@example.com',
        botApiKey: 'api-key',
        messageType: 'stream',
        stream: 'general',
        topic: 'deploy-alerts',
      });
    });

    it('builds config with dm messageType', () => {
      const cfg = buildConfig('zulip', 'https://zulip.example.com', 'bot@example.com', 'api-key', {
        mentionRoleId: 'dm',
        username: 'recipient@example.com',
      });
      expect(cfg.messageType).toBe('dm');
      expect(cfg.dmTo).toBe('recipient@example.com');
    });
  });

  describe('fallback (email)', () => {
    it('builds config with to field for unknown type', () => {
      const cfg = buildConfig('email' as never, 'user@example.com', '');
      expect(cfg).toEqual({ to: 'user@example.com' });
    });
  });
});
