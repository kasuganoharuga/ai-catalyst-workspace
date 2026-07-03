import { NextResponse } from "next/server";

import { getSkillFile, getToolkitModule } from "@/lib/toolkit";

type DownloadRouteContext = {
  params: Promise<{
    module: string;
  }>;
};

export async function GET(_request: Request, context: DownloadRouteContext) {
  const { module: moduleId } = await context.params;
  const toolkitModule = await getToolkitModule(moduleId);

  if (!toolkitModule) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  const skill = await getSkillFile(toolkitModule);

  return new NextResponse(skill, {
    headers: {
      "Content-Disposition": `attachment; filename="${toolkitModule.id}-SKILL.md"`,
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
