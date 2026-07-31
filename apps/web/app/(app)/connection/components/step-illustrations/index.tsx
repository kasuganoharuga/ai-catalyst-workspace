import type { StepIllustrationKey } from "../../../lib/copy";

import {
  AddConnector,
  AllowTools,
  Approve,
  Connectors,
  PasteAddress,
} from "./frames";

/**
 * Wireframe schematics beside each manual step — not screenshots of Claude.
 * Claude's UI has moved before; a stale photo is worse than a rough diagram.
 * Decorative only (`aria-hidden` on each Frame).
 */
export const STEP_ILLUSTRATIONS: Record<
  StepIllustrationKey,
  () => React.ReactElement
> = {
  connectors: Connectors,
  "add-connector": AddConnector,
  "paste-address": PasteAddress,
  approve: Approve,
  "allow-tools": AllowTools,
};
