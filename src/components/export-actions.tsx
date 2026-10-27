"use client";

import { useState } from "react";
import { Download, FileText, Loader2, Printer } from "lucide-react";

import { useToast } from "@/hooks/use-toasts";
import { prescriptionApi } from "@/lib/api";

export function ExportActions({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState<"csv" | null>(null);
  const { toast } = useToast();

  const downloadCsv = async () => {
    setBusy("csv");
    try {
      const response = await fetch(prescriptionApi.exportCsvUrl(), { cache: "no-store" });
      if (!response.ok) throw new Error("Your download could not be prepared right now.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `veridose-prescriptions-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: "CSV downloaded", description: "Up to 100 recent records were exported.", variant: "success" });
    } catch (error) {
      toast({
        title: "CSV export failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const printPdf = () => {
    toast({
      title: "Opening print view",
      description: 'Choose "Save as PDF" as the destination for a PDF copy.',
      variant: "info",
    });
    window.setTimeout(() => window.print(), 350);
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void downloadCsv()} disabled={busy !== null} className="btn btn-secondary min-h-11 px-3.5 text-sm">
        {busy === "csv" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
        CSV
      </button>
      <button type="button" onClick={printPdf} className="btn btn-secondary min-h-11 px-3.5 text-sm">
        <Printer className="size-4" aria-hidden />
        {compact ? "PDF" : "Print / PDF"}
      </button>
    </div>
  );
}

export function ExportHint() {
  return (
    <p className="no-print flex items-center gap-1.5 text-xs text-muted">
      <FileText className="size-3.5" aria-hidden />
      Your export includes medication, dose, duration, status, dates, and notes.
    </p>
  );
}
