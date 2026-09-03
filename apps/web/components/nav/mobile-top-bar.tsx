import type { ReactNode } from "react";

import { Logo } from "@/components/logo";

// Below lg the sidebar is hidden and this bar takes over. Three
// equal-weight grid columns rather than a flex row, so the nav sits
// optically centred regardless of how wide the logo or avatar are.
// `min-w-8` on the logo is load-bearing: it is a replaced element
// (an <img>), and a grid item's default `min-width: auto` lets a
// replaced element shrink well below its own explicit size once the
// middle nav — an `auto` track — claims its full content width on a
// narrow screen. Without it the mark compresses to a sliver instead of
// the nav (which wraps rather than scrolling — see
// sidebar-navigation.tsx) giving way first.
export function MobileTopBar({
  nav,
  userMenu,
}: {
  nav: ReactNode;
  userMenu: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border px-4 py-2.5 lg:hidden">
      <Logo variant="compact" className="min-w-8 shrink-0" />
      {nav}
      <div className="justify-self-end">{userMenu}</div>
    </header>
  );
}
