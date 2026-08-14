"use client";

import { useCallback, useEffect, useState } from "react";

import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

import { useMediaQuery } from "../../hooks/use-media-query";

import type { ModulesCarouselItem } from "../types";
import { ModuleStatusCard } from "./module-status-card";

export type { ModulesCarouselItem };

// Two card rows plus the greeting/next-action/stats content above it needs
// roughly 900px of viewport height to fit without scrolling; below that,
// a second row would push the fold rather than read as "more to drag to".
const TALL_ENOUGH_FOR_TWO_ROWS = "(min-height: 900px)";

type Column = { item: ModulesCarouselItem; index: number }[];

/** Chunks the flat item list into columns of up to `rowsPerColumn`, preserving each item's original index. */
function toColumns(
  items: ModulesCarouselItem[],
  rowsPerColumn: number,
): Column[] {
  const columns: Column[] = [];
  for (let start = 0; start < items.length; start += rowsPerColumn) {
    columns.push(
      items
        .slice(start, start + rowsPerColumn)
        .map((item, offset) => ({ item, index: start + offset })),
    );
  }
  return columns;
}

/** Prefer in-progress, else next available, else first incomplete. */
export function focusModuleIndex(items: ModulesCarouselItem[]): number {
  const statuses = items.map((item) => item.context?.runModule.status ?? null);

  const inProgress = statuses.findIndex((status) => status === "in_progress");
  if (inProgress >= 0) return inProgress;

  const available = statuses.findIndex((status) => status === "available");
  if (available >= 0) return available;

  const readyToUnlock = statuses.findIndex(
    (status) => status === "ready_to_unlock",
  );
  if (readyToUnlock >= 0) return readyToUnlock;

  const firstIncomplete = statuses.findIndex(
    (status) => status !== "completed",
  );
  return firstIncomplete >= 0 ? firstIncomplete : 0;
}

/**
 * Module cards grouped into draggable columns of up to two rows — one row
 * instead when the viewport isn't tall enough for two (see
 * TALL_ENOUGH_FOR_TWO_ROWS). Either way the section never grows past that
 * cap no matter how many Modules exist; dragging pages through the rest
 * instead of stacking more rows underneath.
 */
export function ModulesCarousel({ items }: { items: ModulesCarouselItem[] }) {
  const isTallEnoughForTwoRows = useMediaQuery(TALL_ENOUGH_FOR_TWO_ROWS);
  const rowsPerColumn = isTallEnoughForTwoRows ? 2 : 1;
  const columns = toColumns(items, rowsPerColumn);
  const focusIndex = focusModuleIndex(items);
  const focusColumn = Math.floor(focusIndex / rowsPerColumn);
  const [api, setApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(focusColumn);

  const onSelect = useCallback((carouselApi: CarouselApi) => {
    if (!carouselApi) return;
    setSelectedIndex(carouselApi.selectedScrollSnap());
  }, []);

  useEffect(() => {
    if (!api) return;
    api.on("reInit", onSelect);
    api.on("select", onSelect);
    // Land on in-progress / next after Embla mounts. scrollTo emits
    // select asynchronously, so selectedIndex stays event-driven.
    api.scrollTo(focusColumn, true);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api, focusColumn, onSelect]);

  if (items.length === 0) return null;

  return (
    <Carousel
      opts={{
        align: "start",
        startIndex: focusColumn,
        containScroll: "trimSnaps",
      }}
      setApi={setApi}
      className="w-full"
    >
      <CarouselContent className="-ml-4">
        {columns.map((column, columnIndex) => (
          <CarouselItem
            key={column[0]?.item.catalog.moduleKey ?? columnIndex}
            className={cn(
              // ~1.2 columns peek on mobile, ~2.2 on sm, 3 on lg — always
              // leaves a sliver of the next column so dragging reads as
              // available rather than the row simply ending.
              "basis-[80%] sm:basis-[46%] lg:basis-1/3",
              columns.length > 1 && "cursor-grab active:cursor-grabbing",
            )}
          >
            <div
              className={cn(
                "grid h-full gap-4",
                rowsPerColumn === 2 ? "grid-rows-2" : "grid-rows-1",
              )}
            >
              {column.map(({ item, index }) => (
                <div
                  key={item.catalog.moduleKey}
                  className={
                    rowsPerColumn === 2 && column.length === 1
                      ? "row-span-2"
                      : undefined
                  }
                >
                  <ModuleStatusCard
                    catalog={item.catalog}
                    context={item.context}
                    isFocus={index === focusIndex}
                  />
                </div>
              ))}
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>

      {columns.length > 1 ? (
        <div
          className="mt-4 flex items-center justify-center gap-2"
          role="tablist"
          aria-label="Module columns"
        >
          {columns.map((column, columnIndex) => {
            const isActive = columnIndex === selectedIndex;
            return (
              <button
                key={column[0]?.item.catalog.moduleKey ?? columnIndex}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`Go to ${column.map(({ item }) => item.catalog.title).join(", ")}`}
                onClick={() => api?.scrollTo(columnIndex)}
                className={cn(
                  "size-2 rounded-full transition",
                  isActive
                    ? "bg-foreground"
                    : "bg-border hover:bg-muted-foreground/50",
                )}
              />
            );
          })}
        </div>
      ) : null}
    </Carousel>
  );
}
