export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function PrescriptionCardSkeleton() {
  return (
    <div className="card p-5" aria-hidden>
      <div className="flex items-start gap-3">
        <Skeleton className="size-12 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="mt-5 flex gap-2">
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
    </div>
  );
}

export function PrescriptionListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading prescriptions…</span>
      {Array.from({ length: count }).map((_, index) => (
        <PrescriptionCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="card flex flex-col gap-3 p-4" aria-hidden>
      <Skeleton className="h-8 w-8 rounded-xl" />
      <Skeleton className="h-6 w-12" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}
