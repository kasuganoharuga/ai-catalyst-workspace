import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

import { NewThreadDialog } from "./artefact-comments/new-thread-dialog";

// Plain-text extraction from a react-markdown heading's rendered children,
// for computing an anchor id. Note this reads the *rendered* text, not the
// raw Markdown line artifact-comment threads anchor against
// (packages/services/.../markdown-sections.ts's listHeadings) — the two
// agree for the common case (plain-text headings, no inline emphasis/code),
// which is every heading in the artefact templates today. A heading that
// contains inline Markdown would produce a different string here than the
// raw line does; the only consequence is that a comment thread's "scroll to
// heading" anchor link would not resolve for that one heading — the thread
// itself, its anchor label, and its content are unaffected.
function extractPlainText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractPlainText).join("");
  }
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return extractPlainText(props.children);
  }
  return "";
}

/** Same slug shape used for both the rendered heading id and a comment anchor's `href="#…"` — see slugifyArtifactHeading. */
export function slugifyArtifactHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug.length > 0 ? slug : "section";
}

/**
 * Renders Founder artefact Markdown with the app's type scale — serif
 * headings, readable body, GFM lists/tables — instead of a raw `<pre>`.
 * Headings get a stable, deduplicated `id` so an Artifact comment thread
 * anchored to a heading can link straight to it. When a heading has open
 * comments, it and every block under it (until the next heading of any
 * level — flat segmentation, matching how each heading is independently
 * commentable) get a highlighter-style background, tracked as a running flag while
 * react-markdown renders in document order. Each block still just adds a
 * class to itself; nothing is wrapped in an extra container, so the
 * document's own margins/spacing are never touched (the artifact-comment
 * sidebar deliberately never splits this component's single continuous
 * render into per-section chunks, precisely to avoid disturbing the
 * document's layout).
 */
export function MarkdownDocument({
  content,
  className,
  highlightedHeadings,
  commentTarget,
}: {
  content: string;
  className?: string;
  highlightedHeadings?: { level: number; heading: string }[];
  /**
   * Enables the per-heading "comment on this section" affordance: a small
   * icon that appears in the heading's right gutter on hover. Absolutely
   * positioned, so it costs the document zero layout. This is the only way
   * to open a new comment thread — there is no separate picker/dialog
   * elsewhere to keep in sync with it.
   */
  commentTarget?: { attemptId: string; artifactKey: string; pathname: string };
}) {
  // Fresh per render — react-markdown calls each heading renderer once, in
  // document order, within this single synchronous pass.
  const usedHeadingIds = new Map<string, number>();
  function headingId(children: ReactNode): string {
    const base = slugifyArtifactHeading(extractPlainText(children));
    const count = usedHeadingIds.get(base) ?? 0;
    usedHeadingIds.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  }
  // Whether the block currently rendering falls inside a highlighted
  // section — set by the most recent heading, of any level, and read by
  // every block renderer after it. A mutable single-slot object rather
  // than reassigning a plain variable, same escape valve as usedHeadingIds
  // above: only the object's property changes, so this doesn't trip the
  // "no reassigning render-scoped bindings" lint rule the way `let
  // highlightActive` directly would. Relies on the same document-order
  // synchronous pass headingId's dedup Map already relies on.
  const highlightState = { active: false };
  function markHeading(level: number, children: ReactNode): boolean {
    const text = extractPlainText(children);
    highlightState.active = Boolean(
      highlightedHeadings?.some(
        (entry) => entry.level === level && entry.heading === text,
      ),
    );
    return highlightState.active;
  }
  const HIGHLIGHT_CLASS =
    "-mx-5 rounded-md bg-accent px-5 py-1 sm:-mx-7 sm:px-7 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]";
  // Every heading is a positioning context and a hover group so the gutter
  // affordance below can anchor to it without entering the layout flow.
  const HEADING_CLASS = "group relative scroll-mt-20";
  function headingCommentTrigger(level: number, children: ReactNode) {
    if (!commentTarget) return null;
    const heading = extractPlainText(children);
    if (heading.trim().length === 0) return null;
    return (
      <span className="absolute bottom-0 right-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <NewThreadDialog
          attemptId={commentTarget.attemptId}
          artifactKey={commentTarget.artifactKey}
          pathname={commentTarget.pathname}
          heading={{ level, heading }}
        />
      </span>
    );
  }

  return (
    <div
      className={cn(
        "px-5 py-6 text-[15px] leading-7 text-foreground sm:px-7 sm:py-7",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1
              id={headingId(children)}
              className={cn(
                HEADING_CLASS,
                "font-serif text-[1.75rem] font-medium leading-tight tracking-[-0.02em] text-foreground first:mt-0",
                markHeading(1, children) && HIGHLIGHT_CLASS,
              )}
            >
              {children}
              {headingCommentTrigger(1, children)}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              id={headingId(children)}
              className={cn(
                HEADING_CLASS,
                "mt-8 border-t border-border/70 pt-6 font-serif text-xl font-medium tracking-[-0.01em] text-foreground first:mt-0 first:border-t-0 first:pt-0",
                markHeading(2, children) && HIGHLIGHT_CLASS,
              )}
            >
              {children}
              {headingCommentTrigger(2, children)}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              id={headingId(children)}
              className={cn(
                HEADING_CLASS,
                "mt-5 text-base font-semibold text-foreground",
                markHeading(3, children) && HIGHLIGHT_CLASS,
              )}
            >
              {children}
              {headingCommentTrigger(3, children)}
            </h3>
          ),
          h4: ({ children }) => (
            <h4
              id={headingId(children)}
              className={cn(
                HEADING_CLASS,
                "mt-4 text-sm font-semibold text-foreground",
                markHeading(4, children) && HIGHLIGHT_CLASS,
              )}
            >
              {children}
              {headingCommentTrigger(4, children)}
            </h4>
          ),
          p: ({ children }) => (
            <p
              className={cn(
                "mt-3 text-[15px] leading-7 text-foreground/90 first:mt-0",
                highlightState.active && HIGHLIGHT_CLASS,
              )}
            >
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul
              className={cn(
                "mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-foreground/90",
                highlightState.active && HIGHLIGHT_CLASS,
              )}
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol
              className={cn(
                "mt-3 list-decimal space-y-1.5 pl-5 text-[15px] leading-7 text-foreground/90",
                highlightState.active && HIGHLIGHT_CLASS,
              )}
            >
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              className="font-medium text-foreground underline underline-offset-2"
              rel="noreferrer"
              target="_blank"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className={cn(
                "mt-4 border-l-2 border-border pl-4 text-muted-foreground",
                highlightState.active && HIGHLIGHT_CLASS,
              )}
            >
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-8 border-border" />,
          code: ({ className: codeClassName, children }) => {
            const isBlock = Boolean(codeClassName?.includes("language-"));
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-[13px] leading-6 text-foreground">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px] text-foreground">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre
              className={cn(
                "mt-4 overflow-x-auto rounded-md bg-muted p-3",
                highlightState.active && HIGHLIGHT_CLASS,
              )}
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div
              className={cn(
                "mt-4 overflow-x-auto",
                highlightState.active && HIGHLIGHT_CLASS,
              )}
            >
              <table className="w-full border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border px-3 py-2 font-semibold text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border/70 px-3 py-2 text-foreground/90">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
