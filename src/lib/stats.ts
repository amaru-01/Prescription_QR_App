import type { Prescription } from "@/types/prescription";

export interface DashboardStats {
  total: number;
  active: number;
  completed: number;
  archived: number;
  thisWeek: number;
  uniqueMeds: number;
}

/**
 * Compute dashboard statistics from prescriptions list.
 */
export function computeStats(prescriptions: Prescription[]): DashboardStats {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const stats: DashboardStats = {
    total: prescriptions.length,
    active: 0,
    completed: 0,
    archived: 0,
    thisWeek: 0,
    uniqueMeds: 0,
  };

  const uniqueMedNames = new Set<string>();

  for (const p of prescriptions) {
    // Count by status
    if (p.status === "active") stats.active++;
    else if (p.status === "completed") stats.completed++;
    else if (p.status === "archived") stats.archived++;

    // Count prescriptions from this week
    if (p.createdAt) {
      const createdDate = new Date(p.createdAt);
      if (createdDate >= oneWeekAgo) {
        stats.thisWeek++;
      }
    }

    // Track unique medication names
    uniqueMedNames.add(p.med.toLowerCase().trim());
  }

  stats.uniqueMeds = uniqueMedNames.size;

  return stats;
}

/**
 * Returns the last `n` days as Date objects, oldest first and today last.
 * Each date is set to local midnight.
 *
 * Example: lastNDays(7) -> [6 days ago, ..., yesterday, today]
 */
export function lastNDays(n: number): Date[] {
  const days: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }

  return days;
}
