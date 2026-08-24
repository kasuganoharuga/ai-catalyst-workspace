import { accountNavItems, primaryNavItems, type NavRole } from "./nav-items";
import { NavLink } from "./nav-link";

export function SidebarNavigation({
  role,
  orientation = "vertical",
}: {
  role: NavRole;
  orientation?: "vertical" | "horizontal";
}) {
  const items = primaryNavItems(role);

  if (orientation === "horizontal") {
    // Wraps rather than scrolling: a Mentor's 4 items (the longest set)
    // don't fit on one line at ~375px even at compact sizing, and a
    // same-line overflow-x-auto scroll region hides the last item behind
    // an edge with no visual cue that there's more to see — it clips mid
    // label instead of wrapping to a second, fully visible line.
    return (
      <nav className="flex min-w-0 flex-row flex-wrap gap-1">
        {items.map((item) => (
          <NavLink key={item.href} item={item} compact />
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5 px-3 py-2">
      {items.map((item) => (
        <NavLink key={item.href} item={item} withIcon />
      ))}
      <p className="mt-7 px-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Account
      </p>
      <div className="mt-1.5 flex flex-col gap-0.5">
        {accountNavItems(role).map((item) => (
          <NavLink key={item.href} item={item} withIcon />
        ))}
      </div>
    </nav>
  );
}
