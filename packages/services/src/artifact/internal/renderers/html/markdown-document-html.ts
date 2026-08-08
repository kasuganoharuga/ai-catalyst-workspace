function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Minimal printable HTML shell for confirmed Markdown artefacts (ICA,
 * Roadmap, etc.) during the Gotenberg migration. Not a full Markdown
 * renderer — preserves structure via escaped preformatted text with light
 * heading detection for page breaks.
 */
export function buildMarkdownDocumentHtml(input: {
  title: string;
  markdown: string;
  footerLabel: string;
}): string {
  const blocks = input.markdown.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const body = blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("# ")) {
        return `<h1>${escapeHtml(trimmed.slice(2))}</h1>`;
      }
      if (trimmed.startsWith("## ")) {
        return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      }
      if (trimmed.startsWith("### ")) {
        return `<h3>${escapeHtml(trimmed.slice(4))}</h3>`;
      }
      if (trimmed.startsWith("|")) {
        return `<pre class="table">${escapeHtml(trimmed)}</pre>`;
      }
      return `<p>${escapeHtml(trimmed).replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    body {
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.45;
      color: #1a1a1a;
      margin: 0;
    }
    h1 { font-size: 18pt; margin: 0 0 10pt; break-after: avoid; }
    h2 { font-size: 13pt; margin: 16pt 0 6pt; break-after: avoid; }
    h3 { font-size: 11pt; margin: 12pt 0 4pt; break-after: avoid; }
    p { margin: 0 0 8pt; }
    pre.table {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 8.5pt;
      white-space: pre-wrap;
      border: 1px solid #ddd;
      padding: 6pt;
      break-inside: avoid;
    }
    footer {
      margin-top: 18pt;
      font-size: 9pt;
      color: #666;
    }
  </style>
</head>
<body>
  ${body}
  <footer>${escapeHtml(input.footerLabel)}</footer>
</body>
</html>`;
}
