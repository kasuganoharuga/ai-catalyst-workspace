import { ServiceError } from "@ai-catalyst/services/errors";

/**
 * Chromium HTML → PDF via Gotenberg (Docker API).
 * @see https://gotenberg.dev/docs/routes#convert-with-chromium
 */
export function getGotenbergUrl(): string | null {
  const raw = process.env.GOTENBERG_URL?.trim();
  return raw && raw.length > 0 ? raw.replace(/\/$/, "") : null;
}

export async function renderHtmlToPdf(input: {
  indexHtml: string;
  filename?: string;
  assets?: { name: string; bytes: Buffer; contentType: string }[];
}): Promise<Buffer> {
  const baseUrl = getGotenbergUrl();
  if (!baseUrl) {
    throw new ServiceError(
      "WORKBOOK_RENDERER_NOT_CONFIGURED",
      "GOTENBERG_URL is not configured.",
    );
  }

  const form = new FormData();
  const htmlBytes = Uint8Array.from(Buffer.from(input.indexHtml, "utf8"));
  form.append(
    "files",
    new Blob([htmlBytes], { type: "text/html" }),
    "index.html",
  );
  for (const asset of input.assets ?? []) {
    form.append(
      "files",
      new Blob([Uint8Array.from(asset.bytes)], { type: asset.contentType }),
      asset.name,
    );
  }
  form.append("printBackground", "true");
  form.append("preferCssPageSize", "true");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/forms/chromium/convert/html`, {
      method: "POST",
      body: form,
    });
  } catch (error) {
    throw new ServiceError(
      "WORKBOOK_RENDER_FAILED",
      `Gotenberg request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ServiceError(
      "WORKBOOK_RENDER_FAILED",
      `Gotenberg returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
