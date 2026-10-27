import type { Metadata } from "next";

import { HistoryView } from "@/components/history/history-view";

export const metadata: Metadata = {
  title: "Prescription history",
  description: "Search, filter, and export every prescription saved through VeriDose.",
};

export default function HistoryPage() {
  return <HistoryView />;
}
