// The reusable, renderer-agnostic plan-building engine: a cursor that walks
// down a page, wrapping text and deciding page breaks using real font
// metrics (pdf/metrics.ts), and appends the result to a WorkbookRenderPlan
// as pure data — no pdf-lib PDFDocument is touched here. Both renderers'
// buildPlan() functions (commit 3+) drive this with their own content and
// ordering; this module owns only the shared mechanics.
//
// Structural bugs found while building the first real multi-page layout are
// encoded directly into this design, not left as something a future caller
// could get wrong:
//
// 1. A footer label set "after a section's content" misses any page that
//    section's content overflowed onto — `ensure()` can create a new page
//    mid-section, and that new page becomes `current` immediately. Fix:
//    every `newPage()` call captures the section's *current* footer label
//    at creation time, and `setFooterLabel()` changes what "current" means
//    for every page created after it, not just the page open when it's
//    called.
// 2. A code label meant to sit beside an already-positioned field (e.g. a
//    checkbox placed via `checkboxAt` at an explicit rect) must NOT be
//    drawn through the normal cursor-advancing path — `lockedText`'s
//    default behaviour draws at the *current* cursor, which can be a whole
//    row away from the field it is meant to label. `lockedText` accepts an
//    explicit `y` for exactly this case.
import type { Font as FontkitFont } from "fontkit";

import {
  blockHeight,
  linePitch,
  wrapText,
} from "@ai-catalyst/services/artifact/internal/renderers/pdf/metrics";
import type {
  FieldPlan,
  LockedContentEntry,
  PagePlan,
  RectFillEntry,
} from "../types.js";

export const A4: { width: number; height: number } = {
  width: 595,
  height: 842,
};

/** Default page margin — exported so pdf/render-plan.ts's footer can align to the same margin content is laid out against, rather than duplicating the number. */
export const DEFAULT_MARGIN = 38;

export interface LayoutOptions {
  margin?: number;
  bottomReserve?: number; // vertical space reserved above the margin for the footer
}

export interface TextStyle {
  size: number;
  bold?: boolean;
  color?: { r: number; g: number; b: number };
}

/**
 * Cursor-based layout builder producing plan data (`pages`, `fields`,
 * `lockedContent`) rather than drawing into a live document. Call
 * `toPlanParts()` once done to get the three arrays a `WorkbookRenderPlan`
 * needs (the caller still supplies `provenance`).
 */
export class LayoutBuilder {
  readonly margin: number;
  readonly usableWidth: number;
  private readonly bottomLimit: number;

  private pages: PagePlan[] = [];
  private fields: FieldPlan[] = [];
  private lockedContent: LockedContentEntry[] = [];
  private rects: RectFillEntry[] = [];

  /** Index of the page currently being laid out — 0-indexed, matches `pages`. */
  private pageIndex = -1;
  /** Y position of the cursor on the current page (PDF coordinates: origin bottom-left). */
  y = 0;
  private currentFooterLabel: string | null = null;

  constructor(
    private readonly font: FontkitFont,
    private readonly bold: FontkitFont,
    options: LayoutOptions = {},
  ) {
    this.margin = options.margin ?? DEFAULT_MARGIN;
    this.usableWidth = A4.width - this.margin * 2;
    this.bottomLimit = this.margin + (options.bottomReserve ?? 20);
    this.newPage();
  }

  private fontFor(style: { bold?: boolean }): FontkitFont {
    return style.bold ? this.bold : this.font;
  }

  /** Starts a new page, inheriting whatever footer label is currently set. */
  newPage(): number {
    this.pageIndex += 1;
    this.pages.push({ footerLabel: this.currentFooterLabel });
    this.y = A4.height - this.margin;
    return this.pageIndex;
  }

  /**
   * Sets the footer label for the *rest* of this build, applied
   * retroactively to the page currently open (so calling this immediately
   * after `newPage()` labels that page too) and to every page opened after.
   */
  setFooterLabel(label: string | null): void {
    this.currentFooterLabel = label;
    this.pages[this.pageIndex].footerLabel = label;
  }

  get currentPage(): number {
    return this.pageIndex;
  }

  /** Starts a new page only if `height` of content would not fit above the bottom reserve. */
  ensure(height: number): void {
    if (this.y - height < this.bottomLimit) {
      this.newPage();
    }
  }

  advance(height: number): void {
    this.y -= height;
  }

  wrap(text: string, size: number, maxWidth: number, bold = false): string[] {
    return wrapText(this.fontFor({ bold }), text, size, maxWidth);
  }

  measuredHeight(
    text: string,
    size: number,
    maxWidth: number,
    bold = false,
  ): number {
    return blockHeight(this.fontFor({ bold }), text, size, maxWidth);
  }

  linePitch(size: number, bold = false): number {
    return linePitch(this.fontFor({ bold }), size);
  }

  /**
   * Records one block of locked (non-editable) text.
   *
   * Default mode reads and advances the cursor, page-breaking first if the
   * block would not fit (the whole block moves to the next page rather
   * than splitting a heading from its first line — pass `allowSplit: true`
   * to page-break mid-block instead, for content long enough to span
   * multiple pages on its own).
   *
   * `options.y`, when provided, places the block at that exact position
   * instead — used for a label that must sit beside an already-positioned
   * field (see this file's header, point 2). Neither reads nor advances
   * the cursor.
   */
  lockedText(
    role: string,
    text: string,
    style: TextStyle,
    options: {
      maxWidth?: number;
      x?: number;
      y?: number;
      gap?: number;
      allowSplit?: boolean;
    } = {},
  ): void {
    const maxWidth = options.maxWidth ?? this.usableWidth;
    const x = options.x ?? this.margin;
    const font = this.fontFor(style);
    const height = blockHeight(font, text, style.size, maxWidth);

    if (options.y !== undefined) {
      this.lockedContent.push({
        role,
        text,
        page: this.pageIndex,
        x,
        y: options.y,
        maxWidth,
        size: style.size,
        bold: Boolean(style.bold),
        color: style.color,
      });
      return;
    }

    if (!options.allowSplit) {
      this.ensure(height);
      this.lockedContent.push({
        role,
        text,
        page: this.pageIndex,
        x,
        y: this.y,
        maxWidth,
        size: style.size,
        bold: Boolean(style.bold),
        color: style.color,
      });
      this.y -= height;
    } else {
      // Split at line boundaries: emit as many lines as fit on the current
      // page as one entry, page-break, then continue with the remainder.
      const lines = wrapText(font, text, style.size, maxWidth);
      const pitch = linePitch(font, style.size);
      let remaining = lines;
      while (remaining.length > 0) {
        const capacity = Math.max(
          1,
          Math.floor((this.y - this.bottomLimit) / pitch),
        );
        if (capacity <= 0) {
          this.newPage();
          continue;
        }
        const chunk = remaining.slice(0, capacity);
        remaining = remaining.slice(capacity);
        this.lockedContent.push({
          role,
          text: chunk.join("\n"),
          page: this.pageIndex,
          x,
          y: this.y,
          maxWidth,
          size: style.size,
          bold: Boolean(style.bold),
          color: style.color,
        });
        this.y -= chunk.length * pitch;
        if (remaining.length > 0) {
          this.newPage();
        }
      }
    }
    this.y -= options.gap ?? 0;
  }

  /**
   * Records a solid-colour background fill at an already-decided rect —
   * never advances or reads the cursor, so callers place it either before
   * laying out the content that sits on top (most cases) or after
   * measuring where that content landed (e.g. a card background sized to
   * the text it ends up containing).
   */
  rectAt(
    rect: { x: number; y: number; width: number; height: number },
    color: { r: number; g: number; b: number },
  ): void {
    this.rects.push({ page: this.pageIndex, rect, color });
  }

  /** Reserves a rectangle for a text field, page-breaking first if it doesn't fit. Advances the cursor past it. */
  textField(
    name: string,
    options: {
      width: number;
      height: number;
      multiline?: boolean;
      capacity: number;
      x?: number;
      gap?: number;
    },
  ): FieldPlan {
    this.ensure(options.height);
    const field: FieldPlan = {
      kind: "text",
      name,
      page: this.pageIndex,
      rect: {
        x: options.x ?? this.margin,
        y: this.y - options.height,
        width: options.width,
        height: options.height,
      },
      multiline: Boolean(options.multiline),
      capacity: options.capacity,
    };
    this.fields.push(field);
    this.y -= options.height + (options.gap ?? 0);
    return field;
  }

  /** Places a text field at an already-decided rect without moving the cursor — for side-by-side layouts. */
  textFieldAt(
    name: string,
    rect: { x: number; y: number; width: number; height: number },
    capacity: number,
    multiline = false,
  ): FieldPlan {
    const field: FieldPlan = {
      kind: "text",
      name,
      page: this.pageIndex,
      rect,
      multiline,
      capacity,
    };
    this.fields.push(field);
    return field;
  }

  checkboxAt(
    name: string,
    rect: { x: number; y: number; width: number; height: number },
  ): FieldPlan {
    const field: FieldPlan = {
      kind: "checkbox",
      name,
      page: this.pageIndex,
      rect,
    };
    this.fields.push(field);
    return field;
  }

  dropdownAt(
    name: string,
    rect: { x: number; y: number; width: number; height: number },
    options: string[],
  ): FieldPlan {
    const field: FieldPlan = {
      kind: "dropdown",
      name,
      page: this.pageIndex,
      rect,
      options,
    };
    this.fields.push(field);
    return field;
  }

  toPlanParts(): {
    pages: PagePlan[];
    fields: FieldPlan[];
    lockedContent: LockedContentEntry[];
    rects: RectFillEntry[];
  } {
    return {
      pages: this.pages,
      fields: this.fields,
      lockedContent: this.lockedContent,
      rects: this.rects,
    };
  }
}
