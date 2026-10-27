import type {
  Prescription,
  PrescriptionDraft,
  PrescriptionInput,
  PrescriptionListResponse,
  SavePrescriptionResponse,
  HealthResponse,
} from "@/types/prescription";

/** Base URL for API calls. In production, this is relative to the same origin. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

/** Client-side API wrapper for prescription operations. */
export const prescriptionApi = {
  /** List prescriptions with optional limit. */
  async list(limit = 100): Promise<Prescription[]> {
    const url = new URL(`${API_BASE}/api/prescriptions`);
    if (limit) url.searchParams.set("limit", limit.toString());

    const res = await fetch(url.toString(), {
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch prescriptions: ${res.status} ${text}`);
    }

    const data = (await res.json()) as PrescriptionListResponse;
    return data.prescriptions;
  },

  /** Save a prescription. */
  async save(input: PrescriptionDraft): Promise<SavePrescriptionResponse> {
    const res = await fetch(`${API_BASE}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to save prescription: ${res.status} ${text}`);
    }

    return (await res.json()) as SavePrescriptionResponse;
  },

  /** Get a single prescription by ID. */
  async getById(id: string): Promise<Prescription> {
    const res = await fetch(`${API_BASE}/api/prescriptions/${id}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch prescription: ${res.status} ${text}`);
    }

    return (await res.json()) as Prescription;
  },

  /** Update prescription status. */
  async updateStatus(id: string, status: Prescription["status"]): Promise<void> {
    const res = await fetch(`${API_BASE}/api/prescriptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to update prescription: ${res.status} ${text}`);
    }
  },

  /** Delete a prescription. */
  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/prescriptions/${id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to delete prescription: ${res.status} ${text}`);
    }
  },

  /** Seed demo prescriptions (only available in local mode). */
  async seedDemo(): Promise<{ success: true; inserted: number; message: string }> {
    const res = await fetch(`${API_BASE}/api/demo/seed`, {
      method: "POST",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to seed demo data: ${res.status} ${text}`);
    }

    return (await res.json()) as { success: true; inserted: number; message: string };
  },

  /** Export prescriptions as CSV. */
  async export(): Promise<Blob> {
    const res = await fetch(`${API_BASE}/api/prescriptions/export`, {
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to export prescriptions: ${res.status} ${text}`);
    }

    return res.blob();
  },

  /** Get health status. */
  async health(): Promise<HealthResponse> {
    const res = await fetch(`${API_BASE}/api/health`, {
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch health: ${res.status} ${text}`);
    }

    return (await res.json()) as HealthResponse;
  },
};
