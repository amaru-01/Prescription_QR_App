import { afterEach, describe, expect, it, vi } from "vitest";

const { logger } = vi.hoisted(() => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/server/logger", () => ({ logger }));

const { onRequestError } = await import("./instrumentation");

const request = { path: "/history/abc", method: "GET", headers: { "x-request-id": "trace-0001-xyz" } };
const context = { routerKind: "App Router", routePath: "/history/[id]", routeType: "render", renderSource: "react-server-components", revalidateReason: undefined } as const;

afterEach(() => {
  vi.unstubAllEnvs();
  logger.error.mockClear();
});

describe("onRequestError", () => {
  it("logs unhandled errors with their route and request id", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const error = Object.assign(new Error("render failed"), { digest: "d123" });
    await onRequestError(error, request, context);
    expect(logger.error).toHaveBeenCalledWith(
      "Unhandled request error",
      expect.objectContaining({
        error,
        requestId: "trace-0001-xyz",
        method: "GET",
        path: "/history/abc",
        routePath: "/history/[id]",
        routeType: "render",
        digest: "d123",
      })
    );
  });

  it("does nothing on the edge runtime, where the Node logger is unavailable", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await onRequestError(new Error("x"), request, context);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
