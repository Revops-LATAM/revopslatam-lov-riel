import { Skeleton } from "@/components/ui/skeleton";



export function PageHeaderSkeleton() {
  return (
    <header className="h-12 border-b border-border px-6 flex items-center gap-2">
      <Skeleton className="h-4 w-32" />
    </header>
  );
}

export function TaskListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-6 py-2.5 flex items-center gap-3">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 flex-1 max-w-[60%]" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function ProjectGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="border border-border rounded-md p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function MemberListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="border border-border rounded-md divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-7 w-24" />
        </div>
      ))}
    </div>
  );
}


export function MyTasksSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((g) => (
        <section key={g} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <div className="border border-border rounded-md divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-4 flex-1 max-w-md" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
