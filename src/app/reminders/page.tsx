import type { Metadata } from "next";
import Link from "next/link";
import { BellRing } from "lucide-react";

import { RemindersView } from "@/components/reminders/reminders-view";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePageUser } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Reminders & adherence",
  description: "Track daily doses and see a simple seven-day adherence view for active prescriptions.",
};

export default async function RemindersPage() {
  const user = await requirePageUser("/reminders");

  // Guest (anonymous) accounts are free to create in bulk, so reminders and
  // notifications need a real account. The API enforces this too.
  if (user.isAnonymous) {
    return (
      <EmptyState
        icon={<BellRing className="size-6" aria-hidden />}
        title="Reminders need a free account"
        description="Create an account to set dose reminders, get notifications and track your adherence. Your guest records stay private either way."
        action={
          <Link href="/signup" className="btn btn-primary min-h-11 px-4 text-sm">
            Create an account
          </Link>
        }
      />
    );
  }

  return <RemindersView />;
}
