import { Activity, CalendarPlus, ClipboardList, Pill } from "lucide-react";

import type { DashboardStats } from "@/lib/stats";
import { CountUp, Reveal } from "@/components/motion";

const CARDS = [
  {
    key: "total",
    label: "Prescriptions saved",
    hint: "All records on this device",
    icon: ClipboardList,
    tone: "bg-brand-soft text-brand-strong",
  },
  {
    key: "active",
    label: "Active courses",
    hint: "Currently being taken",
    icon: Activity,
    tone: "bg-accent-soft text-accent",
  },
  {
    key: "thisWeek",
    label: "Added this week",
    hint: "Last 7 days",
    icon: CalendarPlus,
    tone: "bg-elevated text-ink",
  },
  {
    key: "uniqueMeds",
    label: "Medications",
    hint: "Unique names",
    icon: Pill,
    tone: "bg-brand-soft text-brand-strong",
  },
] as const;

export function StatsGrid({ stats }: { stats: DashboardStats }) {
  return (
    <section aria-label="Prescription overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map((card, index) => {
        const Icon = card.icon;
        return (
          <Reveal key={card.key} delay={index * 90}>
          <div className="card group flex h-full flex-col gap-2 p-4 transition hover:-translate-y-1 hover:border-brand/40">
            <span className={`flex size-9 items-center justify-center rounded-xl transition group-hover:rotate-[-8deg] group-hover:scale-110 ${card.tone}`}>
              <Icon className="size-4" aria-hidden />
            </span>
            <p className="text-2xl font-extrabold leading-none text-ink"><CountUp value={stats[card.key]} /></p>
            <div>
              <p className="text-xs font-semibold text-ink">{card.label}</p>
              <p className="text-[0.7rem] text-muted">{card.hint}</p>
            </div>
          </div>
          </Reveal>
        );
      })}
    </section>
  );
}
