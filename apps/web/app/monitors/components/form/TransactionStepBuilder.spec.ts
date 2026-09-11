import { describe, it, expect } from "vitest";
import type { TransactionStep, TransactionStepAssertion } from "../../types";

// TransactionStepBuilder — logic helpers for assertions, header/extract KV editors, step management

// ── AssertionEditor logic ─────────────────────────────────────────────────────

function addAssertion(assertions: TransactionStepAssertion[]): TransactionStepAssertion[] {
  return [...assertions, { type: "status", value: "200" }];
}
function removeAssertion(assertions: TransactionStepAssertion[], idx: number): TransactionStepAssertion[] {
  return assertions.filter((_, i) => i !== idx);
}
function updateAssertion(assertions: TransactionStepAssertion[], idx: number, patch: Partial<TransactionStepAssertion>): TransactionStepAssertion[] {
  return assertions.map((a, i) => (i === idx ? { ...a, ...patch } : a));
}

// ── HeaderKVEditor logic ──────────────────────────────────────────────────────

function updateHeader(headers: Record<string, string>, key: string, val: string, oldKey: string): Record<string, string> {
  const next = { ...headers };
  if (oldKey !== key) delete next[oldKey];
  if (key) next[key] = val;
  return next;
}
function removeHeader(headers: Record<string, string>, k: string): Record<string, string> {
  const next = { ...headers };
  delete next[k];
  return next;
}
function addHeader(headers: Record<string, string>): Record<string, string> {
  return { ...headers, "": "" };
}

// ── ExtractKVEditor logic ─────────────────────────────────────────────────────

function updateExtract(extract: Record<string, string>, varName: string, path: string, oldKey: string): Record<string, string> {
  const next = { ...extract };
  if (oldKey !== varName) delete next[oldKey];
  if (varName) next[varName] = path;
  return next;
}
function removeExtract(extract: Record<string, string>, k: string): Record<string, string> {
  const next = { ...extract };
  delete next[k];
  return next;
}

// ── new step factory ──────────────────────────────────────────────────────────

function makeNewStep(idx: number): TransactionStep {
  return {
    id: `step-${idx}`,
    name: `Step ${idx + 1}`,
    method: "GET",
    url: "",
    headers: {},
    body: "",
    extract: {},
    assertions: [],
  };
}

// ── assertion placeholder text ────────────────────────────────────────────────

function placeholderFor(type: TransactionStepAssertion["type"]): string {
  if (type === "status") return "200";
  if (type === "body_contains") return "ok";
  if (type === "json_path") return "data.status";
  if (type === "header_exists") return "X-Request-Id";
  if (type === "latency_lt") return "1000";
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────

describe("AssertionEditor logic", () => {
  describe("addAssertion", () => {
    it("adds a status assertion with value 200 by default", () => {
      const result = addAssertion([]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: "status", value: "200" });
    });

    it("appends to existing assertions", () => {
      const existing: TransactionStepAssertion[] = [{ type: "body_contains", value: "ok" }];
      const result = addAssertion(existing);
      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({ type: "status", value: "200" });
    });

    it("does not mutate original array", () => {
      const original: TransactionStepAssertion[] = [];
      addAssertion(original);
      expect(original).toHaveLength(0);
    });
  });

  describe("removeAssertion", () => {
    it("removes assertion at index 0", () => {
      const assertions: TransactionStepAssertion[] = [
        { type: "status", value: "200" },
        { type: "body_contains", value: "ok" },
      ];
      const result = removeAssertion(assertions, 0);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("body_contains");
    });

    it("removes last assertion", () => {
      const assertions: TransactionStepAssertion[] = [
        { type: "status", value: "200" },
        { type: "latency_lt", value: "500" },
      ];
      const result = removeAssertion(assertions, 1);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("status");
    });

    it("does not mutate original array", () => {
      const assertions: TransactionStepAssertion[] = [{ type: "status", value: "200" }];
      removeAssertion(assertions, 0);
      expect(assertions).toHaveLength(1);
    });
  });

  describe("updateAssertion", () => {
    it("updates type at index", () => {
      const assertions: TransactionStepAssertion[] = [{ type: "status", value: "200" }];
      const result = updateAssertion(assertions, 0, { type: "body_contains" });
      expect(result[0].type).toBe("body_contains");
      expect(result[0].value).toBe("200");
    });

    it("updates value at index", () => {
      const assertions: TransactionStepAssertion[] = [{ type: "status", value: "200" }];
      const result = updateAssertion(assertions, 0, { value: "201" });
      expect(result[0].value).toBe("201");
    });

    it("sets expected field for json_path", () => {
      const assertions: TransactionStepAssertion[] = [{ type: "json_path", value: "data.id" }];
      const result = updateAssertion(assertions, 0, { expected: "123" });
      expect(result[0].expected).toBe("123");
    });

    it("does not change other assertion entries", () => {
      const assertions: TransactionStepAssertion[] = [
        { type: "status", value: "200" },
        { type: "body_contains", value: "ok" },
      ];
      const result = updateAssertion(assertions, 0, { value: "201" });
      expect(result[1]).toEqual({ type: "body_contains", value: "ok" });
    });
  });

  describe("assertion type set", () => {
    const validTypes: TransactionStepAssertion["type"][] = [
      "status",
      "body_contains",
      "json_path",
      "header_exists",
      "latency_lt",
    ];

    it.each(validTypes)("allows type: %s", (type) => {
      const result = updateAssertion([{ type: "status", value: "200" }], 0, { type });
      expect(result[0].type).toBe(type);
    });
  });
});

describe("HeaderKVEditor logic", () => {
  describe("updateHeader", () => {
    it("updates value for existing key", () => {
      const headers = { "Content-Type": "text/plain" };
      const result = updateHeader(headers, "Content-Type", "application/json", "Content-Type");
      expect(result["Content-Type"]).toBe("application/json");
    });

    it("renames key while preserving value", () => {
      const headers = { "Old-Key": "value" };
      const result = updateHeader(headers, "New-Key", "value", "Old-Key");
      expect("Old-Key" in result).toBe(false);
      expect(result["New-Key"]).toBe("value");
    });

    it("does not add header when key is empty string", () => {
      const headers: Record<string, string> = {};
      const result = updateHeader(headers, "", "value", "");
      expect(Object.keys(result)).toHaveLength(0);
    });

    it("adds new key-value pair", () => {
      const headers = { "Authorization": "Bearer token" };
      const result = updateHeader(headers, "X-Custom", "123", "X-Custom");
      expect(result["X-Custom"]).toBe("123");
      expect(result["Authorization"]).toBe("Bearer token");
    });
  });

  describe("removeHeader", () => {
    it("removes the specified header", () => {
      const headers = { "Content-Type": "application/json", "Authorization": "Bearer token" };
      const result = removeHeader(headers, "Content-Type");
      expect("Content-Type" in result).toBe(false);
      expect(result["Authorization"]).toBe("Bearer token");
    });

    it("does not mutate original", () => {
      const headers = { "X-Header": "val" };
      removeHeader(headers, "X-Header");
      expect("X-Header" in headers).toBe(true);
    });
  });

  describe("addHeader", () => {
    it("adds empty key-value pair", () => {
      const headers = { "Authorization": "Bearer token" };
      const result = addHeader(headers);
      expect("" in result).toBe(true);
      expect(result[""]).toBe("");
    });

    it("preserves existing headers", () => {
      const headers = { "Authorization": "Bearer token" };
      const result = addHeader(headers);
      expect(result["Authorization"]).toBe("Bearer token");
    });
  });
});

describe("ExtractKVEditor logic", () => {
  describe("updateExtract", () => {
    it("sets a variable extraction path", () => {
      const extract: Record<string, string> = {};
      const result = updateExtract(extract, "token", "data.token", "");
      // oldKey "" is same as varName? no: oldKey="", varName="token" → delete ""
      expect(result["token"]).toBe("data.token");
    });

    it("renames variable", () => {
      const extract = { "oldVar": "data.id" };
      const result = updateExtract(extract, "newVar", "data.id", "oldVar");
      expect("oldVar" in result).toBe(false);
      expect(result["newVar"]).toBe("data.id");
    });
  });

  describe("removeExtract", () => {
    it("removes variable by name", () => {
      const extract = { "token": "data.token", "userId": "data.id" };
      const result = removeExtract(extract, "token");
      expect("token" in result).toBe(false);
      expect(result["userId"]).toBe("data.id");
    });
  });
});

describe("Step factory (makeNewStep)", () => {
  it("creates step with correct id", () => {
    const step = makeNewStep(0);
    expect(step.id).toBe("step-0");
  });

  it("creates step with incremental name", () => {
    expect(makeNewStep(0).name).toBe("Step 1");
    expect(makeNewStep(2).name).toBe("Step 3");
  });

  it("defaults method to GET", () => {
    expect(makeNewStep(0).method).toBe("GET");
  });

  it("defaults url to empty string", () => {
    expect(makeNewStep(0).url).toBe("");
  });

  it("defaults assertions to empty array", () => {
    expect(makeNewStep(0).assertions).toEqual([]);
  });

  it("defaults headers to empty object", () => {
    expect(makeNewStep(0).headers).toEqual({});
  });

  it("defaults extract to empty object", () => {
    expect(makeNewStep(0).extract).toEqual({});
  });
});

describe("assertion placeholder text", () => {
  it("shows '200' for status type", () => {
    expect(placeholderFor("status")).toBe("200");
  });

  it("shows 'ok' for body_contains type", () => {
    expect(placeholderFor("body_contains")).toBe("ok");
  });

  it("shows 'data.status' for json_path type", () => {
    expect(placeholderFor("json_path")).toBe("data.status");
  });

  it("shows 'X-Request-Id' for header_exists type", () => {
    expect(placeholderFor("header_exists")).toBe("X-Request-Id");
  });

  it("shows '1000' for latency_lt type", () => {
    expect(placeholderFor("latency_lt")).toBe("1000");
  });
});
