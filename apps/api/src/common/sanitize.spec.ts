import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsString, MaxLength } from 'class-validator';
import { SanitizeHtml } from './sanitize';

class TestDto {
  @SanitizeHtml()
  @IsString()
  @MaxLength(255)
  name!: string;
}

describe('SanitizeHtml', () => {
  function transform(input: Record<string, unknown>): TestDto {
    return plainToInstance(TestDto, input);
  }

  it('passes plain strings through unchanged', () => {
    const dto = transform({ name: 'My Monitor' });
    expect(dto.name).toBe('My Monitor');
  });

  it('strips script tags (content preserved as harmless text)', () => {
    const dto = transform({ name: '<script>alert(1)</script>My Monitor' });
    expect(dto.name).not.toContain('<script>');
    expect(dto.name).not.toContain('</script>');
    expect(dto.name).toContain('My Monitor');
  });

  it('strips inline event handlers', () => {
    const dto = transform({ name: '<img src=x onerror="alert(1)">Name' });
    expect(dto.name).toBe('Name');
    expect(dto.name).not.toContain('<img');
  });

  it('strips HTML entities used to bypass tag stripping', () => {
    // Entity-encoded tags get decoded then stripped; tag content (text) is preserved
    const dto = transform({ name: '&lt;b&gt;bold&lt;/b&gt; foo' });
    expect(dto.name).toBe('bold foo');
    expect(dto.name).not.toContain('<b>');
  });

  it('strips entity-encoded script tags (content preserved as plain text)', () => {
    // <script>alert(1)</script>foo → alert(1)foo — text is harmless, tags are gone
    const dto = transform({ name: '&lt;script&gt;alert(1)&lt;/script&gt;foo' });
    expect(dto.name).not.toContain('<script>');
    expect(dto.name).not.toContain('</script>');
    expect(dto.name).toContain('foo');
  });

  it('trims leading and trailing whitespace', () => {
    const dto = transform({ name: '  hello  ' });
    expect(dto.name).toBe('hello');
  });

  it('returns non-string values as-is', () => {
    // @SanitizeHtml on a non-string value should pass through (validation handles type checking)
    const dto = transform({ name: 123 as unknown as string });
    expect((dto as unknown as { name: unknown }).name).toBe(123);
  });

  it('does not strip normal angle brackets used in text', () => {
    // Users comparing versions like "1.0 > 0.9" should NOT be sanitized
    // But '<' and '>' without forming a tag will be treated as raw chars
    const dto = transform({ name: 'Version > 1.0' });
    expect(dto.name).toBe('Version > 1.0');
  });

  it('should fail validation when name exceeds MaxLength after stripping', async () => {
    const longName = 'a'.repeat(256);
    const dto = transform({ name: longName });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
