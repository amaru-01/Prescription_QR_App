import type { Metadata } from "next";

import { RemindersView } from "@/components/reminders/reminders-view";
import { requirePageUser } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Reminders & adherence",
  description: "Track daily doses and see a simple seven-day adherence view for active prescriptions.",
};

export default async function RemindersPage() {
  await requirePageUser("/reminders");

  return <RemindersView />;
}
