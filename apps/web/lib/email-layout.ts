/**
 * The HTML shell every transactional email is rendered into.
 *
 * Written against the 1997 subset of HTML that mail clients agree on, not
 * the one the app is built in: nested `<table role="presentation">`, every
 * style inlined, no external stylesheet, no web font, no image. Outlook on
 * Windows renders through Word, which ignores padding on `<div>`, drops
 * `flex`/`grid` entirely and mangles shorthand `background`; Gmail strips
 * `<style>` blocks from the clipped-message view. So the layout is tables
 * and `<td>` padding throughout, and anything that cannot survive that is
 * not used.
 *
 * The palette mirrors the sign-in page's brand surfaces (globals.css:
 * --brand-ink / --brand-lime, hairline borders, mono uppercase eyebrow,
 * serif display heading) as sRGB hex — oklch() and `var()` are unusable
 * here. Georgia stands in for Fraunces: a webfont link is blocked by most
 * clients, and a serif that is present everywhere keeps the editorial
 * contrast against the sans body copy.
 *
 * No remote images at all, deliberately. Image blocking is the default in
 * Outlook and in Gmail for unknown senders, and a logo that resolves to a
 * grey placeholder box looks worse than the wordmark set in type.
 */

/** sRGB approximations of the oklch() brand tokens in app/globals.css. */
const COLOR = {
  page: "#FBFBF9",
  card: "#FFFFFF",
  ink: "#1B1B1F",
  inkRule: "#33333A",
  lime: "#ADEC3F",
  limeInk: "#1C2410",
  border: "#E6E5E1",
  foreground: "#1B1B1F",
  muted: "#76767F",
  fieldBackground: "#F6F6F3",
} as const;

const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONT_SERIF = "Georgia, 'Times New Roman', Times, serif";
const FONT_MONO =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

/**
 * Escape before interpolation. Every value that reaches these builders is
 * attacker-influenced in principle — an email address and a generated
 * password both land inside markup, and the address is chosen by whoever
 * filled in the invite form.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A label/value pair on its own hairline-separated row.
 *
 * `mono` sets the value in the monospace stack for strings that are read
 * character by character — a password, where l/1 and O/0 have to be
 * distinguishable.
 */
export function detailRow(params: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}): string {
  const value = escapeHtml(params.value);
  const inner = params.href
    ? `<a href="${escapeHtml(params.href)}" style="color:${COLOR.foreground};text-decoration:underline;text-underline-offset:2px;">${value}</a>`
    : value;
  const valueStyle = params.mono
    ? `font-family:${FONT_MONO};font-size:15px;letter-spacing:0.02em;`
    : `font-family:${FONT_SANS};font-size:14px;`;
  return `
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid ${COLOR.border};">
                  <p style="margin:0 0 6px;font-family:${FONT_MONO};font-size:10px;line-height:14px;font-weight:500;text-transform:uppercase;letter-spacing:0.16em;color:${COLOR.muted};">${escapeHtml(params.label)}</p>
                  <p style="margin:0;${valueStyle}line-height:22px;color:${COLOR.foreground};word-break:break-all;">${inner}</p>
                </td>
              </tr>`;
}

/** Wraps `detailRow` output in the bordered panel the rows sit in. */
export function detailPanel(rows: string[]): string {
  return `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid ${COLOR.border};border-bottom:0;border-radius:8px;background-color:${COLOR.fieldBackground};">
            <tbody>${rows.join("")}
            </tbody>
          </table>`;
}

/**
 * Lime pill call to action.
 *
 * A single-cell table rather than a styled `<a>`: Word-engine Outlook drops
 * padding on inline elements, so the button would collapse to bare link
 * text. The `<a>` keeps its own padding as well, so the whole pill stays
 * clickable in clients that do honour it.
 */
export function primaryButton(params: { href: string; label: string }): string {
  const href = escapeHtml(params.href);
  return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tbody>
              <tr>
                <td align="center" bgcolor="${COLOR.lime}" style="border-radius:999px;background-color:${COLOR.lime};">
                  <a href="${href}" style="display:inline-block;padding:12px 28px;font-family:${FONT_SANS};font-size:14px;font-weight:600;line-height:20px;color:${COLOR.limeInk};text-decoration:none;border-radius:999px;">${escapeHtml(params.label)}</a>
                </td>
              </tr>
            </tbody>
          </table>`;
}

/**
 * Lime-ruled note block, matching the in-app password prompt
 * (app/(app)/dashboard/components/password-prompt.tsx): a left accent rule
 * on a tinted panel.
 *
 * The rule is a 3px-wide `<td>`, not `border-left` — Word-engine Outlook
 * renders one-sided borders on a table cell inconsistently, but it has no
 * trouble with a narrow cell that has a background colour.
 */
export function noteCallout(params: { title: string; body: string }): string {
  return `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${COLOR.fieldBackground};border-radius:6px;">
            <tbody>
              <tr>
                <td width="3" bgcolor="${COLOR.lime}" style="width:3px;font-size:1px;line-height:1px;background-color:${COLOR.lime};">&nbsp;</td>
                <td style="padding:14px 16px;">
                  <p style="margin:0;font-family:${FONT_SANS};font-size:13px;line-height:20px;font-weight:600;color:${COLOR.foreground};">${escapeHtml(params.title)}</p>
                  <p style="margin:5px 0 0;font-family:${FONT_SANS};font-size:13px;line-height:20px;color:${COLOR.muted};">${escapeHtml(params.body)}</p>
                </td>
              </tr>
            </tbody>
          </table>`;
}

/** Body copy paragraph in the card. */
export function paragraph(text: string): string {
  return `
          <p style="margin:0;font-family:${FONT_SANS};font-size:14px;line-height:22px;color:${COLOR.muted};">${escapeHtml(text)}</p>`;
}

/** Vertical rhythm between blocks, as a spacer row Outlook cannot collapse. */
export function spacer(height: number): string {
  return `
          <div style="line-height:${height}px;height:${height}px;font-size:1px;">&nbsp;</div>`;
}

export interface EmailLayoutParams {
  /** Inbox preview line. Shown next to the subject before the body opens. */
  preheader: string;
  /** Mono uppercase brand line above the heading. */
  eyebrow: string;
  /** Serif display heading on the ink panel. */
  heading: string;
  /** Pre-rendered, already-escaped card content. */
  bodyHtml: string;
  /** Small muted line below the card. */
  footnote: string;
}

export function renderEmailLayout(params: EmailLayoutParams): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Opt out of client-side dark-mode inversion: the ink panel and the lime
     accent are already a dark/light pair, and Gmail's auto-invert turns the
     lime CTA into an unreadable mid-grey. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(params.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${COLOR.page};">${escapeHtml(params.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${COLOR.page};">
  <tbody>
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="width:100%;max-width:520px;">
          <tbody>
            <tr>
              <td style="padding:28px 28px 26px;background-color:${COLOR.ink};border-radius:12px 12px 0 0;">
                <p style="margin:0;font-family:${FONT_MONO};font-size:10px;line-height:14px;font-weight:500;text-transform:uppercase;letter-spacing:0.22em;color:${COLOR.lime};">${escapeHtml(params.eyebrow)}</p>
                <h1 style="margin:22px 0 0;font-family:${FONT_SERIF};font-size:26px;line-height:32px;font-weight:500;letter-spacing:-0.01em;color:#FFFFFF;">${escapeHtml(params.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="height:3px;line-height:3px;font-size:1px;background-color:${COLOR.lime};">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px;background-color:${COLOR.card};border:1px solid ${COLOR.border};border-top:0;border-radius:0 0 12px 12px;">${params.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 0;">
                <p style="margin:0;font-family:${FONT_SANS};font-size:11px;line-height:18px;color:${COLOR.muted};">${escapeHtml(params.footnote)}</p>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>
</body>
</html>`;
}

export const EMAIL_COLOR = COLOR;
