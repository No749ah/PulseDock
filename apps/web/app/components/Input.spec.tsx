import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { INPUT_BASE } from "../design-tokens";
import { Input } from "./Input";

describe("Input design primitive", () => {
  it("contains the shared interactive field states", () => {
    expect(INPUT_BASE).toContain("focus:border-accent");
    expect(INPUT_BASE).toContain("focus:ring-accent/30");
    expect(INPUT_BASE).toContain("disabled:cursor-not-allowed");
  });

  it("generates unique labelled input ids when labels repeat", () => {
    const html = renderToStaticMarkup(<><Input label="API token" /><Input label="API token" /></>);
    const ids = [...html.matchAll(/<input[^>]+id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("preserves explicit id and combines descriptions with the error", () => {
    const html = renderToStaticMarkup(<Input id="token" label="API token" aria-describedby="token-help" error="Required" />);
    expect(html).toContain('aria-describedby="token-help token-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('id="token-error"');
  });
});
