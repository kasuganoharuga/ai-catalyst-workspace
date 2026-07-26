import { NextResponse } from "next/server";

import { getFounderArtifactDocument } from "@/lib/artifacts";
import { getCurrentFounderActor } from "@/lib/current-founder-actor";
import { serviceErrorResponse } from "@/lib/service-error-response";

type DownloadRouteContext = {
  params: Promise<{ moduleKey: string; artifactKey: string }>;
};

function safeFilename(name: string): string {
  // Australian spelling: this lands in the founder's downloads folder.
  // The `artifact*` identifiers around it are DTO field names, not copy.
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "artefact.md";
}

export async function GET(_request: Request, context: DownloadRouteContext) {
  try {
    const { moduleKey, artifactKey } = await context.params;
    const actor = await getCurrentFounderActor();
    const document = await getFounderArtifactDocument(
      actor,
      moduleKey,
      artifactKey,
    );

    if (!document) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Artefact not found." } },
        { status: 404 },
      );
    }

    const filename = safeFilename(
      document.requiredFilename ?? `${document.artifactKey}.md`,
    );

    return new NextResponse(document.content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
