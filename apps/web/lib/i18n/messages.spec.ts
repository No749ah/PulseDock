import { describe, it, expect } from 'vitest';
import { messages, defaultLocale, localeLabels, type Locale } from './messages';

describe('i18n messages', () => {
  it('default locale is en', () => {
    expect(defaultLocale).toBe('en');
  });

  it('has labels for all locales', () => {
    expect(localeLabels.en).toBe('English');
    expect(localeLabels.de).toBe('Deutsch');
  });

  it('has en and de message sets', () => {
    expect(messages).toHaveProperty('en');
    expect(messages).toHaveProperty('de');
  });

  it('en and de have matching top-level keys', () => {
    const enKeys = Object.keys(messages.en).sort();
    const deKeys = Object.keys(messages.de).sort();
    expect(enKeys).toEqual(deKeys);
  });

  it('en and de have matching nested keys for each section', () => {
    for (const section of Object.keys(messages.en) as Array<keyof typeof messages.en>) {
      const enNested = Object.keys(messages.en[section]).sort();
      const deNested = Object.keys(messages.de[section]).sort();
      expect(enNested, `section "${section}" key mismatch`).toEqual(deNested);
    }
  });

  it('no empty string values in en', () => {
    for (const [section, entries] of Object.entries(messages.en)) {
      for (const [key, value] of Object.entries(entries as Record<string, string>)) {
        expect(value, `en.${section}.${key}`).toBeTruthy();
        expect(typeof value, `en.${section}.${key}`).toBe('string');
      }
    }
  });

  it('no empty string values in de', () => {
    for (const [section, entries] of Object.entries(messages.de)) {
      for (const [key, value] of Object.entries(entries as Record<string, string>)) {
        expect(value, `de.${section}.${key}`).toBeTruthy();
        expect(typeof value, `de.${section}.${key}`).toBe('string');
      }
    }
  });

  it('all locales are represented in Locale type (runtime check)', () => {
    const locales: Locale[] = ['en', 'de'];
    for (const locale of locales) {
      expect(messages).toHaveProperty(locale);
      expect(localeLabels).toHaveProperty(locale);
    }
  });
});
