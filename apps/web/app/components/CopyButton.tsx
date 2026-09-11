"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "./Button";

interface CopyButtonProps {
  value: string;
  children?: (state: { copied: boolean; copy: () => void }) => React.ReactNode;
}

export function CopyButton({ value, children }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_err) {
      // Clipboard API may fail in some contexts — silently degrade
    }
  };

  if (children) {
    return <>{children({ copied, copy })}</>;
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={copy}
      className="flex items-center gap-2"
    >
      {copied ? (
        <>
          <Check className="w-4 h-4" />
          Copied
        </>
      ) : (
        <>
          <Copy className="w-4 h-4" />
          Copy
        </>
      )}
    </Button>
  );
}
