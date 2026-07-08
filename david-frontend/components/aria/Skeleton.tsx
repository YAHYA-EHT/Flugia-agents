"use client";

/**
 * Loading skeletons for feature screens (Executive Assistant pages). These stand
 * in while data settles, in place of entrance "pop" animations — which are
 * reserved for the dashboard and department overview.
 */

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton text-slate-300 dark:text-slate-600 ${className}`} style={style} />;
}

/** A stat/metric card placeholder. */
export function SkeletonStat() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <Skeleton className="h-9 w-9 rounded-lg" />
      <Skeleton className="h-6 w-12" />
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-2.5 w-14" />
    </div>
  );
}

/** A titled chart-card placeholder. */
export function SkeletonChart({ height = 140, className = "" }: { height?: number; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      <Skeleton className="mb-1.5 h-4 w-32" />
      <Skeleton className="mb-4 h-2.5 w-24" />
      <Skeleton className="w-full rounded-lg" style={{ height }} />
    </div>
  );
}

/** A quick-link / row placeholder. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="h-3.5 w-24" />
    </div>
  );
}

/** A list-item placeholder: icon + two text lines + trailing action. */
export function SkeletonListItem() {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <Skeleton className="h-4 w-4 rounded" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-2.5 w-1/3" />
      </div>
      <Skeleton className="h-4 w-4 rounded" />
    </div>
  );
}

/** A bordered card placeholder (email account / knowledge base). */
export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-2.5 w-28" />
        </div>
        <Skeleton className="h-7 w-16 rounded-lg" />
      </div>
    </div>
  );
}
