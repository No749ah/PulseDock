'use client';

import { useState, useCallback } from 'react';
import { Copy, CheckCheck, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  body: string;
}

function tryFormatJson(raw: string): { formatted: string; isJson: boolean } {
  const trimmed = raw.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return { formatted: JSON.stringify(JSON.parse(trimmed), null, 2), isJson: true };
    } catch {
      // not valid JSON
    }
  }
  return { formatted: raw, isJson: false };
}

/** Syntax-colors a JSON string with span-based highlighting (no external dep). */
function JsonHighlight({ code }: { code: string }) {
  // Simple token-based colorize: strings, numbers, booleans, null, keys
  const tokens = code.split(/("(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)/g);
  let inKey = false;
  return (
    <code className="text-xs leading-5 font-mono">
      {tokens.map((token, i) => {
        if (!token) return null;
        // Check if this is a JSON key (string followed by colon)
        if (token.startsWith('"') && token.endsWith('"')) {
          const nextNonSpace = tokens.slice(i + 1).find(t => t && t.trim());
          const isKey = nextNonSpace?.trim().startsWith(':');
          inKey = !!isKey;
          return (
            <span key={i} className={isKey ? 'text-blue-300' : 'text-green-300'}>
              {token}
            </span>
          );
        }
        if (/^\b\d/.test(token)) return <span key={i} className="text-yellow-300">{token}</span>;
        if (token === 'true') return <span key={i} className="text-emerald-400">{token}</span>;
        if (token === 'false') return <span key={i} className="text-red-400">{token}</span>;
        if (token === 'null') return <span key={i} className="text-gray-400">{token}</span>;
        return <span key={i} className="text-text-secondary">{token}</span>;
      })}
    </code>
  );
}

export function ResponseBodyViewer({ body }: Props) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { formatted, isJson } = tryFormatJson(body);

  const copyBody = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select & execCommand
    }
  }, [formatted]);

  const lineCount = formatted.split('\n').length;
  const isTall = lineCount > 8;

  return (
    <div className="mt-1 rounded-lg border border-border/60 bg-[#0d1117] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-elevated/40 border-b border-border/40">
        <span className="text-[10px] text-text-muted font-mono select-none">
          {isJson ? 'JSON' : 'text'} · {body.length} chars
        </span>
        <div className="flex items-center gap-1">
          {isTall && (
            <button
              className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors"
            onClick={copyBody}
            title="Copy response body"
            aria-label="Copy response body"
          >
            {copied ? (
              <CheckCheck className="w-3.5 h-3.5 text-success" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        className={`px-3 py-2 overflow-y-auto transition-all ${expanded || !isTall ? 'max-h-[500px]' : 'max-h-28'}`}
      >
        {isJson ? (
          <pre className="whitespace-pre-wrap break-all leading-5 text-xs">
            <JsonHighlight code={formatted} />
          </pre>
        ) : (
          <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap break-all leading-5">
            {body}
          </pre>
        )}
      </div>
    </div>
  );
}
