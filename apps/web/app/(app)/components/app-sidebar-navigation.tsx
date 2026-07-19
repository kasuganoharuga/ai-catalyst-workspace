import { ACCOUNT_NAV_ITEMS, PRIMARY_NAV_ITEMS } from "./nav-items";
import { NavLink } from "./nav-link";

export { ACCOUNT_NAV_ITEMS, PRIMARY_NAV_ITEMS };

export function AppSidebarNavigation({
  orientation = "vertical",
}: {
  orientation?: "vertical" | "horizontal";
}) {
  if (orientation === "horizontal") {
    return (
      <nav className="flex min-w-0 flex-row gap-1 overflow-x-auto">
        {PRIMARY_NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5 px-3 py-2">
      {PRIMARY_NAV_ITEMS.map((item) => (
        <NavLink key={item.href} item={item} withIcon />
      ))}
      <p className="mt-7 px-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Account
      </p>
      <div className="mt-1.5 flex flex-col gap-0.5">
        {ACCOUNT_NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} withIcon />
        ))}
      </div>
    </nav>
  );
}
