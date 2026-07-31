"use client";

import { useCallback, useEffect, useState } from "react";

import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

import type { ModulesCarouselItem } from "../types";
import { ModuleStatusCard } from "./module-status-card";

export type { ModulesCarouselItem };

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

/** Module cards carousel; opens on the current / next module. */
export function ModulesCarousel({ items }: { items: ModulesCarouselItem[] }) {
  const focusIndex = focusModuleIndex(items);
  const [api, setApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(focusIndex);

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
    api.scrollTo(focusIndex, true);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api, focusIndex, onSelect]);

  if (items.length === 0) return null;

  return (
    <Carousel
      opts={{
        align: "start",
        startIndex: focusIndex,
        containScroll: "trimSnaps",
      }}
      setApi={setApi}
      className="w-full"
    >
      <CarouselContent className="-ml-4">
        {items.map((item, index) => {
          const isFocus = index === selectedIndex;
          const isNext = index === selectedIndex + 1;
          return (
            <CarouselItem
              key={item.catalog.moduleKey}
              className={cn(
                // Two-up on sm+: fills the row so a pair doesn't sit left-biased.
                // Narrow screens keep a peek of the next card.
                "basis-[85%] sm:basis-1/2",
                items.length > 1 && "cursor-grab active:cursor-grabbing",
                isFocus || isNext ? "opacity-100" : "opacity-70",
              )}
            >
              <div className="h-full">
                <ModuleStatusCard
                  catalog={item.catalog}
                  context={item.context}
                />
              </div>
            </CarouselItem>
          );
        })}
      </CarouselContent>

      {items.length > 1 ? (
        <div
          className="mt-4 flex items-center justify-center gap-2"
          role="tablist"
          aria-label="Module slides"
        >
          {items.map((item, index) => {
            const isActive = index === selectedIndex;
            return (
              <button
                key={item.catalog.moduleKey}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`Go to ${item.catalog.title}`}
                onClick={() => api?.scrollTo(index)}
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
