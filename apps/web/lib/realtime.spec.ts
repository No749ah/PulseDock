import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
};

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocket),
}));

import { io } from "socket.io-client";

describe("createRealtimeSocket", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { origin: "https://oc-dev-test.no749ah.com" },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a socket with correct config", async () => {
    const { createRealtimeSocket } = await import("./realtime");
    const socket = createRealtimeSocket("user-123");

    expect(io).toHaveBeenCalledWith(
      "https://oc-dev-test.no749ah.com/realtime",
      expect.objectContaining({
        withCredentials: true,
        path: "/api/socket.io",
        transports: ["polling", "websocket"],
        auth: { userId: "user-123" },
        query: { userId: "user-123" },
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      })
    );

    expect(socket).toBe(mockSocket);
  });

  it("uses current window origin for the URL", async () => {
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:1234" },
    });
    vi.resetModules();

    const { createRealtimeSocket } = await import("./realtime");
    createRealtimeSocket("test-user");

    expect(io).toHaveBeenCalledWith(
      "http://localhost:1234/realtime",
      expect.anything()
    );
  });

  it("passes userId in both auth and query", async () => {
    const { createRealtimeSocket } = await import("./realtime");
    createRealtimeSocket("abc-def");

    const config = (io as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(config.auth).toEqual({ userId: "abc-def" });
    expect(config.query).toEqual({ userId: "abc-def" });
  });
});
