import type { StepIllustrationKey } from "../../../lib/copy";

import {
  ChatgptAddServer,
  ChatgptApprove,
  ChatgptCustomMcp,
  ChatgptPlugins,
  ChatgptSettings,
} from "./chatgpt-frames";
import {
  AddConnector,
  AllowTools,
  Approve,
  Connectors,
  PasteAddress,
} from "./frames";

/**
 * Wireframe schematics beside each manual step — not screenshots of the
 * assistants. Both of these UIs have moved before; a stale photo is worse
 * than a rough diagram. Decorative only (`aria-hidden` on each Frame).
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
  "chatgpt-settings": ChatgptSettings,
  "chatgpt-plugins": ChatgptPlugins,
  "chatgpt-add-server": ChatgptAddServer,
  "chatgpt-custom-mcp": ChatgptCustomMcp,
  "chatgpt-approve": ChatgptApprove,
};
