import type { Metadata } from "next";

import { RemindersView } from "@/components/reminders/reminders-view";

export const metadata: Metadata = {
  title: "Reminders & adherence",
  description: "Track daily doses and see a simple seven-day adherence view for active prescriptions.",
};

export default function RemindersPage() {
  return <RemindersView />;
}
