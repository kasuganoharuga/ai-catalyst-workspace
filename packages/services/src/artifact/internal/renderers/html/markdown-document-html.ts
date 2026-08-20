import { marked } from "marked";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

marked.setOptions({
  gfm: true,
  breaks: false,
});

/**
 * Shared print chrome for HTML→Gotenberg documents.
 *
 * Footer is `position: fixed` so Chromium repeats it on every page. An
 * in-flow trailing `<footer>` used to orphan onto a blank last page when
 * the previous page had little leftover space (especially with
 * `break-inside: avoid` tables).
 */
export function wrapPrintableDocumentHtml(input: {
  title: string;
  bodyHtml: string;
  footerLabel: string;
  extraCss?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.5;
      color: #1a1a1a;
      margin: 0;
      padding-bottom: 0;
    }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 18pt;
      font-weight: 600;
      line-height: 1.25;
      margin: 0 0 12pt;
      break-after: avoid;
    }
    h2 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 13pt;
      font-weight: 600;
      margin: 14pt 0 6pt;
      padding-top: 8pt;
      border-top: 1px solid #ddd;
      break-after: avoid;
      page-break-after: avoid;
    }
    h2:first-child { border-top: 0; padding-top: 0; margin-top: 0; }
    h3 {
      font-size: 11pt;
      font-weight: 650;
      margin: 12pt 0 5pt;
      break-after: avoid;
      page-break-after: avoid;
    }
    h4 {
      font-size: 10.5pt;
      font-weight: 650;
      margin: 10pt 0 4pt;
      break-after: avoid;
      page-break-after: avoid;
    }
    /* Keep a heading with the first block that follows so Validation Status
       (and similar section openers) cannot orphan at the bottom of a page. */
    h2 + p, h2 + ul, h2 + ol, h2 + table, h2 + h3,
    h3 + p, h3 + ul, h3 + ol, h3 + table {
      break-before: avoid;
      page-break-before: avoid;
    }
    p { margin: 0 0 7pt; }
    ul, ol { margin: 0 0 10pt; padding-left: 1.4rem; }
    li { margin: 0 0 3pt; }
    li > ul, li > ol { margin: 4pt 0 0; }
    strong { font-weight: 650; }
    em { font-style: italic; }
    blockquote {
      margin: 10pt 0;
      padding: 0 0 0 10pt;
      border-left: 2px solid #ccc;
      color: #444;
    }
    code {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 9pt;
      background: #f4f4f4;
      padding: 0 3pt;
    }
    pre {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 8.5pt;
      white-space: pre-wrap;
      background: #f7f7f7;
      border: 1px solid #e2e2e2;
      padding: 8pt;
      margin: 0 0 10pt;
      break-inside: avoid;
    }
    pre code { background: transparent; padding: 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 12pt;
      font-size: 9.5pt;
      break-inside: avoid;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 5pt 7pt;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f2f2f2; font-weight: 650; }
    hr {
      border: 0;
      border-top: 1px solid #ddd;
      margin: 14pt 0;
    }
    a { color: #1a1a1a; text-decoration: underline; }
    /* Chromium print repeats fixed elements on every page; keep out of flow
       so a trailing footer never creates a blank last page by itself. */
    .print-footer {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      padding-top: 6pt;
      border-top: 1px solid #ddd;
      font-size: 9pt;
      color: #666;
      background: #fff;
    }
    ${input.extraCss ?? ""}
  </style>
</head>
<body>
  ${input.bodyHtml}
  <div class="print-footer">${escapeHtml(input.footerLabel)}</div>
</body>
</html>`;
}

/**
 * Printable HTML for confirmed Markdown artefacts (Verdict, ICA, Evidence).
 * Renders Markdown to HTML (GFM lists/tables) then wraps a print stylesheet
 * — same body the Founder reads on the website, not escaped source text.
 */
export function buildMarkdownDocumentHtml(input: {
  title: string;
  markdown: string;
  footerLabel: string;
}): string {
  const body = marked.parse(input.markdown.replace(/\r\n/g, "\n"), {
    async: false,
  }) as string;

  return wrapPrintableDocumentHtml({
    title: input.title,
    bodyHtml: body,
    footerLabel: input.footerLabel,
  });
}
