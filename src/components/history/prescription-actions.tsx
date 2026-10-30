"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, CheckCircle2, Loader2, Printer, RotateCcw, Save, Trash2 } from "lucide-react";

import { useToast } from "@/hooks/use-toasts";
import { prescriptionApi } from "@/lib/api";
import type { Prescription, PrescriptionStatus } from "@/types/prescription";

export function PrescriptionActions({ prescription }: { prescription: Prescription }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<PrescriptionStatus | "delete" | "notes" | null>(null);
  const [notes, setNotes] = useState(prescription.notes ?? "");

  const setStatus = async (status: PrescriptionStatus) => {
    setBusy(status);
    try {
      await prescriptionApi.update(prescription.id, { status });
      window.dispatchEvent(new Event("veridose:data-changed"));
      toast({ title: `Marked as ${status}`, variant: "success" });
      router.refresh();
    } catch (error) {
      toast({
        title: "Could not update the record",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const saveNotes = async () => {
    setBusy("notes");
    try {
      await prescriptionApi.update(prescription.id, { notes: notes.trim() ? notes.trim() : null });
      window.dispatchEvent(new Event("veridose:data-changed"));
      toast({ title: "Notes updated", variant: "success" });
      router.refresh();
    } catch (error) {
      toast({
        title: "Could not save notes",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this prescription permanently? This cannot be undone.")) return;
    setBusy("delete");
    try {
      await prescriptionApi.delete(prescription.id);
      window.dispatchEvent(new Event("veridose:data-changed"));
      toast({ title: "Prescription deleted", variant: "success" });
      router.push("/history");
    } catch (error) {
      toast({
        title: "Could not delete the record",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {prescription.status !== "active" ? (
          <button
            type="button"
            onClick={() => void setStatus("active")}
            disabled={busy !== null}
            className="btn btn-primary min-h-11 text-sm"
          >
            {busy === "active" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
            Mark active
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void setStatus("completed")}
            disabled={busy !== null}
            className="btn btn-primary min-h-11 text-sm"
          >
            {busy === "completed" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
            Complete course
          </button>
        )}
        <button
          type="button"
          onClick={() => void setStatus("archived")}
          disabled={busy !== null}
          className="btn btn-secondary min-h-11 text-sm"
        >
          {busy === "archived" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Archive className="size-4" aria-hidden />}
          Archive
        </button>
        <button type="button" onClick={() => window.print()} className="btn btn-secondary min-h-11 text-sm">
          <Printer className="size-4" aria-hidden />
          Print / PDF
        </button>
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy !== null}
          className="btn btn-ghost ml-auto min-h-11 text-sm text-danger hover:bg-danger/10 hover:text-danger"
        >
          {busy === "delete" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
          Delete
        </button>
      </div>

      <div>
        <label htmlFor="detail-notes" className="mb-1.5 block text-sm font-semibold text-ink">
          Notes
        </label>
        <textarea
          id="detail-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Add directions, side effects to watch for, or questions for your pharmacist…"
          className="field resize-y"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-muted">Saved privately with this prescription.</p>
          <button
            type="button"
            onClick={() => void saveNotes()}
            disabled={busy !== null || notes === (prescription.notes ?? "")}
            className="btn btn-secondary min-h-10 px-3 text-xs"
          >
            {busy === "notes" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />}
            Save notes
          </button>
        </div>
      </div>
    </div>
  );
}
