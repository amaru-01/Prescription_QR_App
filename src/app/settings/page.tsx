import type { Metadata } from "next";

import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = {
  title: "Settings",
  description: "Profile shell, dark mode, backend status, exports, offline queue, and install options.",
};

export default function SettingsPage() {
  return <SettingsView />;
}
