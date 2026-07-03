import type { ToolkitModule } from "./module";

export type ToolkitManifest = {
  version: string;
  title: string;
  description: string;
  modules: ToolkitModule[];
};
