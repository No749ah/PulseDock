import { Transform, TransformFnParams } from 'class-transformer';

/**
 * Strips HTML tags from a string value to prevent stored XSS.
 * Decodes common HTML entities before stripping to catch encoded payloads.
 */
function stripHtml(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  // Decode common HTML entities that could be used to bypass tag-stripping
  let decoded = value
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#x3C;/gi, '<')
    .replace(/&#60;/gi, '<')
    .replace(/&#x3E;/gi, '>')
    .replace(/&#62;/gi, '>');

  // Strip all HTML/XML tags
  decoded = decoded.replace(/<[^>]*>/g, '');

  // Trim whitespace
  return decoded.trim();
}

/**
 * Property decorator that sanitizes string input by stripping HTML tags.
 * Apply to any user-provided text field that may be rendered in the UI.
 *
 * @example
 * ```ts
 * @SanitizeHtml()
 * @IsString()
 * name!: string;
 * ```
 */
export function SanitizeHtml(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => stripHtml(value));
}
