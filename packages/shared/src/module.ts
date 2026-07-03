export type ModuleStatus = "draft" | "review" | "ready";

export type ToolkitModule = {
  id: string;
  number: string;
  slug: string;
  title: string;
  objective: string;
  founderInputs: string[];
  outputs: string[];
  status: ModuleStatus;
  skillPath: string;
  modulePath: string;
};
