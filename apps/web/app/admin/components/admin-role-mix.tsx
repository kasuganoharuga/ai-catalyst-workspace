import { adminDashboardCopy } from "../lib/copy";

type AdminRoleBucket = "founder" | "mentor" | "admin" | "pending";

const BUCKET_ORDER: AdminRoleBucket[] = [
  "founder",
  "mentor",
  "admin",
  "pending",
];

const BUCKET_BAR_CLASS: Record<AdminRoleBucket, string> = {
  founder: "bg-foreground",
  mentor: "bg-brand-lime",
  admin: "bg-muted-foreground/55",
  pending: "bg-muted-foreground/25",
};

export function AdminRoleMix({
  roles,
  total,
}: {
  roles: Record<AdminRoleBucket, number>;
  total: number;
}) {
  if (total === 0) return null;

  return (
    <section className="mt-14">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-2xl font-medium tracking-[-0.01em]">
          {adminDashboardCopy.roleHeading}
        </h2>
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {adminDashboardCopy.roleTotal(total)}
        </p>
      </div>

      <div
        className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-muted"
        aria-hidden="true"
      >
        {BUCKET_ORDER.map((bucket) => {
          const count = roles[bucket];
          if (count === 0) return null;
          return (
            <span
              key={bucket}
              className={BUCKET_BAR_CLASS[bucket]}
              style={{ width: `${(count / total) * 100}%` }}
            />
          );
        })}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {BUCKET_ORDER.map((bucket) => (
          <div key={bucket} className="min-w-0">
            <dt className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${BUCKET_BAR_CLASS[bucket]}`}
              />
              {adminDashboardCopy.roleLabels[bucket]}
            </dt>
            <dd className="mt-1 font-serif text-[1.75rem] font-medium tabular-nums tracking-[-0.02em]">
              {roles[bucket]}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
