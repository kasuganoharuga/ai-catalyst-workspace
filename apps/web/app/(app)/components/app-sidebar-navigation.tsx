import { accountNavItems, primaryNavItems } from "./nav-items";
import { NavLink } from "./nav-link";

export function AppSidebarNavigation({
  role,
  orientation = "vertical",
}: {
  role: "founder" | "mentor";
  orientation?: "vertical" | "horizontal";
}) {
  const items = primaryNavItems(role);

  if (orientation === "horizontal") {
    return (
      <nav className="flex min-w-0 flex-row gap-1 overflow-x-auto">
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
