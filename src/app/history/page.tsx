import type { Metadata } from "next";

import { HistoryView } from "@/components/history/history-view";
import { requirePageUser } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Prescription history",
  description: "Search, filter, and export every prescription saved through VeriDose.",
};

export default async function HistoryPage() {
  await requirePageUser("/history");

  return <HistoryView />;
}
