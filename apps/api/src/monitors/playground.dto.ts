import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PlaygroundDto {
  @ApiProperty({ description: 'URL to check (must be http:// or https://)', example: 'https://api.example.com/health' })
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiPropertyOptional({ description: 'HTTP method', default: 'GET', example: 'GET' })
  @IsOptional()
  @IsString()
  @IsIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
  method?: string;

  @ApiPropertyOptional({ description: 'Request headers to send' })
  @IsOptional()
  headers?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Request body (for POST/PUT/PATCH)' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: 'Expected HTTP status code', example: 200 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(599)
  @Type(() => Number)
  expectedStatus?: number;

  @ApiPropertyOptional({ description: 'Assert that the response body contains this string' })
  @IsOptional()
  @IsString()
  bodyContains?: string;

  @ApiPropertyOptional({ description: 'JSONPath expression to evaluate against response body', example: '$.status' })
  @IsOptional()
  @IsString()
  bodyJsonPath?: string;

  @ApiPropertyOptional({ description: 'Expected value for the JSONPath result' })
  @IsOptional()
  @IsString()
  bodyJsonPathExpected?: string;

  @ApiPropertyOptional({ description: 'Request timeout in ms (default 10000, max 30000)', default: 10000 })
  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(30000)
  @Type(() => Number)
  timeoutMs?: number;

  @ApiPropertyOptional({ description: 'Follow HTTP redirects (default true)', default: true })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  followRedirects?: boolean;

  @ApiPropertyOptional({ description: 'Check SSL certificate info for HTTPS URLs (default true)', default: true })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  checkSsl?: boolean;
}

export interface PlaygroundTimings {
  dnsMs?: number;
  tcpMs?: number;
  tlsMs?: number;
  ttfbMs?: number;
  downloadMs?: number;
}

export interface PlaygroundSslInfo {
  daysRemaining: number;
  issuer: string;
  expiresAt: string;
  valid: boolean;
}

export interface PlaygroundAssertions {
  statusOk?: boolean;
  bodyContainsOk?: boolean;
  bodyJsonPathOk?: boolean;
}

export interface PlaygroundResult {
  ok: boolean;
  statusCode: number;
  latencyMs: number;
  timings?: PlaygroundTimings;
  redirectChain?: string[];
  responseHeaders: Record<string, string>;
  bodyExcerpt: string;
  bodyJsonPathResult?: string;
  contentType?: string;
  sslInfo?: PlaygroundSslInfo;
  assertions: PlaygroundAssertions;
  error?: string;
}
