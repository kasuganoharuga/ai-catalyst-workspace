import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Renders Founder artefact Markdown with the app's type scale — serif
 * headings, readable body, GFM lists/tables — instead of a raw `<pre>`.
 */
export function MarkdownDocument({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
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
            <h1 className="font-serif text-[1.75rem] font-medium leading-tight tracking-[-0.02em] text-foreground first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-8 border-t border-border/70 pt-6 font-serif text-xl font-medium tracking-[-0.01em] text-foreground first:mt-0 first:border-t-0 first:pt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-5 text-base font-semibold text-foreground">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-4 text-sm font-semibold text-foreground">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="mt-3 text-[15px] leading-7 text-foreground/90 first:mt-0">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-foreground/90">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[15px] leading-7 text-foreground/90">
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
            <blockquote className="mt-4 border-l-2 border-border pl-4 text-muted-foreground">
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
            <pre className="mt-4 overflow-x-auto rounded-md bg-muted p-3">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mt-4 overflow-x-auto">
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
