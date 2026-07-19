import type { ToolkitModule } from "./module.js";

export type ToolkitManifest = {
  version: string;
  title: string;
  description: string;
  modules: ToolkitModule[];
};
