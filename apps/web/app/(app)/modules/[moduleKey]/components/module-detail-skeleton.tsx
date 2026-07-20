type ModuleDetailSkeletonProps = {
  /** Module 0 has no right rail — match that single-column layout. */
  singleColumn?: boolean;
};

export function ModuleDetailSkeleton({
  singleColumn = false,
}: ModuleDetailSkeletonProps) {
  return (
    <div className="animate-pulse">
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-full bg-muted" />
          <div className="h-10 w-64 max-w-full rounded-md bg-muted" />
        </div>
        <div className="h-8 w-28 rounded-full bg-muted" />
      </div>
      <div className="mt-4 h-5 w-full max-w-xl rounded-md bg-muted" />
      {singleColumn ? (
        <div className="mt-10 space-y-6">
          <div className="h-48 rounded-[2rem] bg-muted" />
          <div className="h-32 rounded-[2rem] bg-muted" />
        </div>
      ) : (
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-6">
            <div className="h-48 rounded-[2rem] bg-muted" />
            <div className="h-32 rounded-[2rem] bg-muted" />
          </div>
          <div className="space-y-6">
            <div className="h-40 rounded-[2rem] bg-muted" />
            <div className="h-32 rounded-[2rem] bg-muted" />
          </div>
        </div>
      )}
    </div>
  );
}
