import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the api.ts helper — CSRF handling, error parsing, and URL inference.
 * API URLs are resolved when used so host and environment changes are
 * reflected without relying on module cache resets.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  // CI sets this for production-like builds; inference tests must exercise
  // the host fallback independently of that process-wide setting.
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", {
    location: {
      host: "localhost:1234",
      protocol: "http:",
      origin: "http://localhost:1234",
      href: "/dashboard",
    },
  });
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function ok(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

describe("api() — basic requests", () => {
  it("makes GET with credentials:include", async () => {
    fetchMock.mockResolvedValueOnce(ok({ data: [] }));
    const { api } = await import("./api");
    const result = await api<{ data: unknown[] }>("/v1/monitors");

    expect(result).toEqual({ data: [] });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/monitors");
    expect(opts.credentials).toBe("include");
    expect(opts.headers["content-type"]).toBe("application/json");
  });

  it("throws with parsed error message on 404", async () => {
    fetchMock.mockResolvedValueOnce(ok({ message: "Not Found" }, 404));
    const { api } = await import("./api");
    await expect(api("/v1/monitors/999")).rejects.toThrow("Not Found");
  });

  it("joins NestJS validation arrays into comma-separated string", async () => {
    // CSRF fetch (cookie is empty so it tries to fetch)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ csrfToken: "tok" }),
    });
    // Actual POST returns validation error
    fetchMock.mockResolvedValueOnce(
      ok({ message: ["email must be an email", "name is required"] }, 400)
    );
    const { api } = await import("./api");
    await expect(
      api("/v1/auth/register", undefined, { method: "POST" })
    ).rejects.toThrow("email must be an email, name is required");
  });

  it("handles nested error.message structure", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ error: { message: "Rate limit exceeded" } }, 429)
    );
    const { api } = await import("./api");
    await expect(api("/v1/monitors")).rejects.toThrow("Rate limit exceeded");
  });

  it("falls back to HTTP status code when body is empty", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("no json")),
      text: () => Promise.resolve(""),
    });
    const { api } = await import("./api");
    await expect(api("/v1/monitors")).rejects.toThrow("HTTP 500");
  });
});

describe("api() — CSRF handling", () => {
  it("injects X-CSRF-Token header on POST from cookie", async () => {
    vi.stubGlobal("document", {
      cookie: "session=abc; pulsedock_csrf=tok-123; other=val",
    });
    fetchMock.mockResolvedValueOnce(ok({ id: "1" }, 201));

    const { api } = await import("./api");
    await api("/v1/monitors", undefined, {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
    });

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers["x-csrf-token"]).toBe("tok-123");
  });

  it("injects CSRF on DELETE", async () => {
    vi.stubGlobal("document", {
      cookie: "pulsedock_csrf=del-token",
    });
    fetchMock.mockResolvedValueOnce(ok({ ok: true }));

    const { api } = await import("./api");
    await api("/v1/monitors/1", undefined, { method: "DELETE" });

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers["x-csrf-token"]).toBe("del-token");
  });

  it("does NOT inject CSRF on GET", async () => {
    vi.stubGlobal("document", {
      cookie: "pulsedock_csrf=should-not-appear",
    });
    fetchMock.mockResolvedValueOnce(ok({ data: [] }));

    const { api } = await import("./api");
    await api("/v1/monitors");

    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers["x-csrf-token"]).toBeUndefined();
  });

  it("fetches CSRF token from API when cookie is absent", async () => {
    // CSRF endpoint call
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ csrfToken: "fetched-token" }),
    });
    // Actual POST
    fetchMock.mockResolvedValueOnce(ok({ ok: true }));

    const { api } = await import("./api");
    await api("/v1/monitors", undefined, { method: "POST" });

    // First fetch should be the CSRF endpoint
    expect(fetchMock.mock.calls[0][0]).toContain("/v1/auth/csrf");
  });
});

describe("api() — 401 refresh flow", () => {
  it("retries request after successful token refresh", async () => {
    // Original request: 401
    fetchMock.mockResolvedValueOnce(ok({ message: "Unauthorized" }, 401));
    // Refresh: success
    fetchMock.mockResolvedValueOnce(
      ok({
        accessToken: "new",
        refreshToken: "new-r",
        user: { id: "1", email: "a@b.com", role: "admin" },
      })
    );
    // Retry: success
    fetchMock.mockResolvedValueOnce(ok({ monitors: [{ id: 1 }] }));

    const { api } = await import("./api");
    const result = await api<{ monitors: unknown[] }>("/v1/monitors");

    expect(result).toEqual({ monitors: [{ id: 1 }] });
    // 3 calls: original + refresh + retry
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stores user data in localStorage after refresh", async () => {
    fetchMock.mockResolvedValueOnce(ok({}, 401));
    fetchMock.mockResolvedValueOnce(
      ok({
        accessToken: "t",
        refreshToken: "r",
        user: { id: "42", email: "noah@test.com", role: "admin", name: "Noah" },
      })
    );
    fetchMock.mockResolvedValueOnce(ok({ ok: true }));

    const { api } = await import("./api");
    await api("/v1/health");

    expect(localStorage.setItem).toHaveBeenCalledWith(
      "pulsedock_user",
      expect.stringContaining("Noah")
    );
  });
});

describe("API_BASE inference", () => {
  it("resolves localhost to http://localhost:4321", async () => {
    vi.stubGlobal("window", {
      location: { host: "localhost:1234", protocol: "http:" },
    });
    const { getApiBase } = await import("./api");
    expect(getApiBase()).toBe("http://localhost:4321");
  });

  it("resolves oc-dev-test.* to /api proxy", async () => {
    vi.stubGlobal("window", {
      location: { host: "oc-dev-test.no749ah.com", protocol: "https:" },
    });
    const { getApiBase } = await import("./api");
    expect(getApiBase()).toBe("https://oc-dev-test.no749ah.com/api");
  });

  it("resolves oc-web-test.* to oc-api-test.*", async () => {
    vi.stubGlobal("window", {
      location: { host: "oc-web-test.no749ah.com", protocol: "https:" },
    });
    const { getApiBase } = await import("./api");
    expect(getApiBase()).toBe("https://oc-api-test.no749ah.com");
  });

  it("defaults to /api proxy for unknown hosts", async () => {
    vi.stubGlobal("window", {
      location: { host: "custom.example.com", protocol: "https:" },
    });
    const { getApiBase } = await import("./api");
    expect(getApiBase()).toBe("https://custom.example.com/api");
  });

  it("uses NEXT_PUBLIC_API_BASE_URL env var when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    const { getApiBase } = await import("./api");
    expect(getApiBase()).toBe("https://api.example.com");
  });
});
