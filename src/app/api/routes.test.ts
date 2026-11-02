import { beforeEach, describe, expect, it, vi } from "vitest";

import { BackendError } from "@/lib/server/errors";

const { requireUser, data } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  data: {
    savePrescription: vi.fn(),
    getPrescriptionById: vi.fn(),
    updatePrescription: vi.fn(),
    deletePrescription: vi.fn(),
    listPrescriptionPage: vi.fn(),
    exportPrescriptions: vi.fn(),
  },
}));

vi.mock("@/lib/server/auth", () => ({ requireUser }));
vi.mock("@/lib/server/prescriptions", () => data);
// Keep test output clean; errorResponse logs unexpected failures.
vi.mock("@/lib/server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const save = await import("./save/route");
const item = await import("./prescriptions/[id]/route");
const list = await import("./prescriptions/route");
const exporter = await import("./prescriptions/export/route");

const ORIGIN = "https://veridose.app";
let uidCounter = 0;

function jsonRequest(path: string, method: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", host: "veridose.app", origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
  // A fresh uid per test keeps the in-memory rate limiter from carrying over.
  requireUser.mockResolvedValue({ uid: `user-${++uidCounter}` });
});

describe("POST /api/save", () => {
  const valid = { med: "Amoxicillin", dose: "500mg", duration: "7 days" };

  it("returns 401 without a session", async () => {
    requireUser.mockRejectedValue(new BackendError("Please log in to continue.", 401));
    const res = await save.POST(jsonRequest("/api/save", "POST", valid));
    expect(res.status).toBe(401);
    expect(data.savePrescription).not.toHaveBeenCalled();
  });

  it("returns 403 for cross-site requests before touching the session", async () => {
    const res = await save.POST(jsonRequest("/api/save", "POST", valid, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("returns 422 with field errors for invalid input", async () => {
    const res = await save.POST(jsonRequest("/api/save", "POST", { med: "", dose: "500mg" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.detail).toBe("Please check the prescription fields.");
    expect(body.errors).toMatchObject({ med: expect.any(String), duration: expect.any(String) });
  });

  it("returns 422 with the notes message when notes are too long", async () => {
    const res = await save.POST(jsonRequest("/api/save", "POST", { ...valid, notes: "n".repeat(501) }));
    expect(res.status).toBe(422);
    expect((await res.json()).detail).toBe("Notes must be 500 characters or fewer");
  });

  it("saves trimmed input for the signed-in user only", async () => {
    requireUser.mockResolvedValue({ uid: "owner-1" });
    data.savePrescription.mockResolvedValue({ documentId: "doc1", prescription: { id: "doc1", ...valid } });
    const res = await save.POST(jsonRequest("/api/save", "POST", { ...valid, med: " Amoxicillin ", source: "manual" }));
    expect(res.status).toBe(200);
    expect(data.savePrescription).toHaveBeenCalledWith("owner-1", valid, { source: "manual", notes: null });
    expect((await res.json()).document_id).toBe("doc1");
  });

  it("hides internal error details", async () => {
    data.savePrescription.mockRejectedValue(new Error("PERMISSION_DENIED: service account xyz"));
    const res = await save.POST(jsonRequest("/api/save", "POST", valid));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("service account");
    expect(body.request_id).toEqual(expect.any(String));
  });
});

describe("/api/prescriptions/[id]", () => {
  it("returns 404 for ids that are not valid document ids", async () => {
    const res = await item.GET(new Request(`${ORIGIN}/api/prescriptions/x`), params("../../users"));
    expect(res.status).toBe(404);
    expect(data.getPrescriptionById).not.toHaveBeenCalled();
  });

  it("passes the session uid so users only reach their own records", async () => {
    requireUser.mockResolvedValue({ uid: "owner-2" });
    data.getPrescriptionById.mockRejectedValue(new BackendError("Prescription not found.", 404));
    const res = await item.GET(new Request(`${ORIGIN}/api/prescriptions/abc`), params("abc"));
    expect(res.status).toBe(404);
    expect(data.getPrescriptionById).toHaveBeenCalledWith("owner-2", "abc");
  });

  it("rejects unknown statuses on PATCH", async () => {
    const res = await item.PATCH(jsonRequest("/api/prescriptions/abc", "PATCH", { status: "deleted" }), params("abc"));
    expect(res.status).toBe(422);
    expect(data.updatePrescription).not.toHaveBeenCalled();
  });

  it("rejects an empty PATCH", async () => {
    const res = await item.PATCH(jsonRequest("/api/prescriptions/abc", "PATCH", {}), params("abc"));
    expect(res.status).toBe(422);
  });

  it("updates status and notes", async () => {
    data.getPrescriptionById.mockResolvedValue({ id: "abc", status: "completed" });
    const res = await item.PATCH(
      jsonRequest("/api/prescriptions/abc", "PATCH", { status: "completed", notes: " done " }),
      params("abc")
    );
    expect(res.status).toBe(200);
    expect(data.updatePrescription).toHaveBeenCalledWith(expect.any(String), "abc", { status: "completed", notes: "done" });
  });

  it("requires same-origin for DELETE", async () => {
    const request = new Request(`${ORIGIN}/api/prescriptions/abc`, {
      method: "DELETE",
      headers: { host: "veridose.app", "sec-fetch-site": "cross-site" },
    });
    const res = await item.DELETE(request, params("abc"));
    expect(res.status).toBe(403);
    expect(data.deletePrescription).not.toHaveBeenCalled();
  });
});

describe("GET /api/prescriptions", () => {
  it("validates the query string", async () => {
    const res = await list.GET(new Request(`${ORIGIN}/api/prescriptions?limit=9999`));
    expect(res.status).toBe(400);
  });

  it("returns a page with the next cursor", async () => {
    data.listPrescriptionPage.mockResolvedValue({ prescriptions: [{ id: "a" }], nextCursor: "a" });
    const res = await list.GET(new Request(`${ORIGIN}/api/prescriptions?limit=1&cursor=prev`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, count: 1, prescriptions: [{ id: "a" }], next_cursor: "a" });
    expect(data.listPrescriptionPage).toHaveBeenCalledWith(expect.any(String), { limit: 1, cursor: "prev" });
  });
});

describe("GET /api/prescriptions/export", () => {
  it("returns 401 without a session", async () => {
    requireUser.mockRejectedValue(new BackendError("Please log in to continue.", 401));
    expect((await exporter.GET()).status).toBe(401);
  });

  it("downloads CSV without caching", async () => {
    data.exportPrescriptions.mockResolvedValue('"ID"');
    const res = await exporter.GET();
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="prescriptions-\d{4}-\d{2}-\d{2}\.csv"$/);
  });
});
