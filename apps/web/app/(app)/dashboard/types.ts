import type { ReactNode } from "react";

import type { ModuleCatalogEntry, ModuleContext } from "@ai-catalyst/shared";

export type ModuleGridItem = {
  catalog: ModuleCatalogEntry;
  context: ModuleContext | null;
};

export type DashboardNextAction =
  | {
      kicker?: string;
      title: string;
      body: string;
      href: string;
      cta: string;
      skippable?: true;
    }
  | {
      title: string;
      body: string;
      ensure: true;
      cta: string;
    };

export type ConnectionStatContent = {
  value: string;
  label: ReactNode;
};

export type DashboardViewModel = {
  greeting: string;
  welcomeSub: string | null;
  nextAction: DashboardNextAction;
  showPasswordPrompt: boolean;
  unlockedCount: number;
  visibleCatalogCount: number;
  artefactsSaved: number;
  connectionStat: ConnectionStatContent;
  moduleGridItems: ModuleGridItem[];
};
