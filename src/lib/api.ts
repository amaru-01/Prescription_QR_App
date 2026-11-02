import type {
  ApiErrorPayload,
  Prescription,
  PrescriptionDraft,
  PrescriptionListResponse,
  SavePrescriptionResponse,
  HealthResponse,
  PrescriptionUpdate,
} from "@/types/prescription";
import type { DashboardStats } from "@/lib/stats";

/** Base URL for API calls. In production, this is relative to the same origin. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

/** API failure carrying the server's user-safe message and status code. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public payload: ApiErrorPayload | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetch an API route with the session cookie. A 401 means the session has
 * expired or was revoked, so send the user to log in and come back here.
 */
async function request(path: string, init: RequestInit = {}, fallback = "Something went wrong."): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  });

  if (res.ok) return res;

  const payload = (await res.json().catch(() => null)) as ApiErrorPayload | null;

  if (res.status === 401 && typeof window !== "undefined") {
    const next = `${window.location.pathname}${window.location.search}`;
    // Deliberately a full navigation (not router.push): it discards in-memory client
    // state from the expired session, and this helper runs outside React.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }

  throw new ApiError(payload?.detail ?? fallback, res.status, payload);
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Client-side API wrapper for prescription operations. */
export const prescriptionApi = {
  /** One page of prescriptions, newest first. Pass the previous `nextCursor` to continue. */
  async listPage(
    { limit = 50, cursor }: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ prescriptions: Prescription[]; nextCursor: string | null }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    const res = await request(`/api/prescriptions?${params}`, {}, "Could not load prescriptions.");
    const data = (await res.json()) as PrescriptionListResponse;
    return { prescriptions: data.prescriptions, nextCursor: data.next_cursor };
  },

  /** Totals across all of the user's records. */
  async stats(): Promise<DashboardStats> {
    const res = await request("/api/prescriptions/stats", {}, "Could not load your totals.");
    return ((await res.json()) as { success: true; stats: DashboardStats }).stats;
  },

  /** Save a prescription. */
  async save(input: PrescriptionDraft): Promise<SavePrescriptionResponse> {
    const res = await request("/api/save", { method: "POST", ...json(input) }, "Could not save the prescription.");
    return (await res.json()) as SavePrescriptionResponse;
  },

  /** Get a single prescription by ID. */
  async getById(id: string): Promise<Prescription> {
    const res = await request(`/api/prescriptions/${encodeURIComponent(id)}`, {}, "Could not load the prescription.");
    const data = (await res.json()) as { success: true; prescription: Prescription };
    return data.prescription;
  },

  /** Update a prescription's status and/or notes. */
  async update(id: string, updates: PrescriptionUpdate): Promise<void> {
    await request(
      `/api/prescriptions/${encodeURIComponent(id)}`,
      { method: "PATCH", ...json(updates) },
      "Could not update the prescription.",
    );
  },

  /** Delete a prescription. */
  async delete(id: string): Promise<void> {
    await request(`/api/prescriptions/${encodeURIComponent(id)}`, { method: "DELETE" }, "Could not delete the prescription.");
  },

  /** Export prescriptions as CSV. */
  async export(): Promise<Blob> {
    const res = await request("/api/prescriptions/export", {}, "Could not export prescriptions.");
    return res.blob();
  },

  /** Get health status. */
  async health(): Promise<HealthResponse> {
    const res = await request("/api/health", {}, "Could not check the connection.");
    return (await res.json()) as HealthResponse;
  },
};

/** Account operations backed by the server session. */
export const accountApi = {
  async updateName(name: string): Promise<void> {
    await request("/api/auth/profile", { method: "PATCH", ...json({ name }) }, "Could not update your name.");
  },
};
