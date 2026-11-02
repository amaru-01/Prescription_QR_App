import type { Metadata } from "next";

import { SettingsView } from "@/components/settings/settings-view";
import { requirePageUser } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Settings",
  description: "Profile shell, dark mode, backend status, exports, offline queue, and install options.",
};

export default async function SettingsPage() {
  await requirePageUser("/settings");

  return <SettingsView />;
}
