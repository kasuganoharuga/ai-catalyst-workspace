"use client";

import { FileText, Loader2, Paperclip, Upload, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  uploadPrepDocumentAction,
  withdrawPrepDocumentAction,
} from "@/lib/actions/prep-actions";

import { resolveModuleCopy } from "../../../../lib/copy";
import type { Module1RunProps } from "../../types";
import { StepHeading } from "../shared/step-heading";

// Its own step, ahead of "Work through it": material the Founder hands
// over before "Continue in Claude", so the facilitator can read it at the
// start of the conversation rather than mid-interview.
//
// Files are stored and passed through untouched — nothing here extracts or
// summarises. That is deliberate: the assistant reads the Founder's own
// words, and a server-side summary would quietly become a second, staler
// version of what the file says.
//
// The list of what is already uploaded stays on the page itself; the
// dropzone lives behind an "Add documents" button in a dialog, so the page
// reads as a short status view and the picker only appears when wanted.

// No image types. Nothing extracts text server-side, so a screenshot
// reaches the assistant as bytes it cannot read — see
// storage/internal/upload-validation.ts, which is the actual gate. This
// list only decides what the OS picker greys out.
const ACCEPTED = ".pdf,.docx,.doc,.md,.markdown,.txt,.csv,.rtf";

function humanSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Module1DocumentsStep(props: Module1RunProps) {
  const { moduleKey, programRunModuleId, prepDocuments, preview } = props;
  const copy = resolveModuleCopy(moduleKey);
  const isPreview = preview !== null;

  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Drag events fire for every child element the pointer crosses, so a
  // plain boolean flickers as it moves over the icon or the text. Counting
  // enter/leave pairs keeps the highlight steady until the pointer really
  // leaves the zone.
  const dragDepth = useRef(0);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !programRunModuleId) return;
    setError(null);

    // One request per file so a single rejected type does not discard the
    // rest of a multi-file selection.
    startTransition(async () => {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.set("programRunModuleId", programRunModuleId);
        formData.set("file", file);
        const result = await uploadPrepDocumentAction(formData);
        if (!result.ok) {
          setError(result.message);
          break;
        }
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function handleRemove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await withdrawPrepDocumentAction(id);
      if (!result.ok) setError(result.message);
    });
  }

  function resetDrag() {
    dragDepth.current = 0;
    setDragging(false);
  }

  return (
    <>
      <StepHeading title={copy.documentsTitle} body={copy.documentsBody} />

      {/* Concrete examples for this Module specifically. "Notes, research,
          anything written down" gets either nothing or a data dump,
          because the founder cannot tell which of their files this Module
          can actually use. */}
      {copy.documentsSuggestions && copy.documentsSuggestions.length > 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Useful here
          </p>
          <ul className="mt-2 space-y-1.5">
            {copy.documentsSuggestions.map((suggestion) => (
              <li
                key={suggestion}
                className="flex gap-2 text-sm leading-6 text-muted-foreground"
              >
                <span aria-hidden="true" className="text-border">
                  —
                </span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Nothing to hand over is fine — this step is optional, and you can
            come back to it.
          </p>
        </div>
      ) : null}

      {isPreview || !programRunModuleId ? (
        <div className="mt-6 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm leading-6 text-muted-foreground">
          Documents can be added once this module is live.
        </div>
      ) : (
        <div className="mt-6">
          {prepDocuments.length > 0 ? (
            <ul className="space-y-2">
              {prepDocuments.map((document) => (
                <li
                  key={document.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <FileText
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                    />
                    <span className="truncate text-sm text-foreground">
                      {document.filename}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {humanSize(document.sizeBytes)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(document.id)}
                    disabled={pending}
                    aria-label={`Remove ${document.filename}`}
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing uploaded yet.
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => setOpen(true)}
          >
            <Paperclip aria-hidden="true" className="h-4 w-4" />
            Add documents
          </Button>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            resetDrag();
            setError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add documents</DialogTitle>
            <DialogDescription>
              Drag files in, or browse for them. They are stored exactly as you
              send them — nothing is rewritten or summarised.
            </DialogDescription>
          </DialogHeader>

          {/*
            The native input is visually hidden rather than styled. Its
            built-in control ("Choose file / No file chosen") is rendered by
            the browser in the operating system's language, which would put
            text we do not control — and cannot translate — in the middle of
            an English dialog. A label-wrapped custom button keeps the real
            input in the accessibility tree and keyboard order.
          */}
          <label
            onDragEnter={(event) => {
              event.preventDefault();
              dragDepth.current += 1;
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepth.current -= 1;
              if (dragDepth.current <= 0) resetDrag();
            }}
            onDrop={(event) => {
              event.preventDefault();
              resetDrag();
              if (!pending) handleFiles(event.dataTransfer.files);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center transition-colors",
              dragging
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/30 hover:bg-muted/50",
              pending && "pointer-events-none opacity-60",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED}
              disabled={pending}
              onChange={(event) => handleFiles(event.target.files)}
              className="sr-only"
            />
            <Upload
              aria-hidden="true"
              className={cn(
                "h-6 w-6",
                dragging ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className="text-sm text-foreground">
              {dragging ? (
                "Drop to upload"
              ) : (
                <>
                  <span className="font-medium underline underline-offset-4">
                    Browse files
                  </span>{" "}
                  <span className="text-muted-foreground">
                    or drag them here
                  </span>
                </>
              )}
            </span>
            <span className="text-xs leading-5 text-muted-foreground">
              PDF, Word, Markdown, text, CSV or RTF. Up to 20 MB each.
            </span>
          </label>

          {pending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin"
              />
              Uploading…
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
