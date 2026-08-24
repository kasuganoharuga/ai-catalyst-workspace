import type { PreferredAiProvider } from "@ai-catalyst/shared";

import type { ManualStep } from "./connection";

// ── Per-assistant connection copy ───────────────────────────────────────

export interface AssistantCopy {
  /** The founder-facing product name. Never render the provider enum. */
  name: string;
  title: string;
  titleConnected: string;
  /** Two intros: disconnected vs already-connected audiences. */
  intro: string;
  introConnected: string;
  expiredBody: string;

  setupTitle: string;
  setupBody: string;
  manualSteps: ManualStep[];
  /**
   * Only present when the assistant's settings are also reachable in a
   * browser. Absent means the step renders no fallback line at all.
   */
  settingsFallbackPrefix?: string;
  settingsFallbackLink?: string;

  troubleshooting: { symptom: string; fix: string }[];

  waitingTitle: string;
  waitingBody: string;
  connectedTitle: string;
  connectedBody: string;

  disconnectTitle: string;
  disconnectBody: string;
  disconnectDone: string;

  statusLastActivity: string;
  statusActiveNote: string;
  statusNeverUsedNote: string;
  statusIdleNote: string;

  privacyBody: string;

  handoff: {
    /** Deep-link shape: the primary button. Copy-first shape: the secondary link. */
    openCta: string;
    retryCta: string;
    hint: string;
    /** Deep-link shape only — the browser escape hatch. */
    fallbackPrefix?: string;
    fallbackLink?: string;
  };
}

export const assistantCopy: Record<PreferredAiProvider, AssistantCopy> = {
  claude: {
    name: "Claude",
    title: "Connect Claude",
    titleConnected: "Claude connection",
    intro:
      "Connect Claude once. It takes about two minutes, and your first module opens as soon as you're done.",
    introConnected:
      "Claude is connected to this workspace. Everything below is here if you want to check on it or end access.",
    expiredBody:
      "Your saved work is safe. Use Repair connection below to set Claude up again with the same address.",

    setupTitle: "Add the connector in Claude",
    setupBody: "Five steps, once. You'll approve access at the end.",

    // No menu route — Claude moved connectors; link goes straight to the page.
    manualSteps: [
      {
        title: "Open your connectors in Claude",
        body: "They live under Customize.",
        linkLabel: "Open connectors in the Claude app",
        illustration: "connectors",
      },
      {
        title: "Add a custom connector",
        body: "Use the Add button on that page and choose the custom option.",
        illustration: "add-connector",
      },
      {
        title: "Name it and paste this address",
        // Advanced OAuth fields look required; server registers the client.
        body: 'Call it anything — "AI Catalyst" works. Leave the two advanced fields empty.',
        showAddress: true,
        illustration: "paste-address",
      },
      {
        title: "Approve access",
        body: "Claude shows a link that opens your browser. Sign in there and approve.",
        illustration: "approve",
      },
      {
        title: "Allow the tools",
        body: "Saves Claude asking permission every time it writes to your workspace.",
        optional: true,
        illustration: "allow-tools",
      },
    ],

    settingsFallbackPrefix: "Nothing happened?",
    settingsFallbackLink: "Open connectors in your browser",

    troubleshooting: [
      {
        symptom: `There's no "Add custom connector" option`,
        fix: "Custom connectors need a paid Claude plan. They don't appear on the Free plan.",
      },
      {
        symptom: "You're on a Team or Enterprise plan",
        fix: "Only the workspace owner can add a connector. Ask them to add it once, and it appears for everyone.",
      },
      // Claude moved connectors to Customize — link beats menu navigation.
      {
        symptom: "Claude's screens don't match these steps",
        fix: "Claude moves this page from time to time — it currently sits under Customize. Use the link above rather than navigating by menu.",
      },
      {
        symptom: "You approved access, but this page hasn't moved",
        fix: "Come back to this tab and leave it open for a few seconds. It checks while you're looking at it.",
      },
    ],

    waitingTitle: "Waiting for Claude",
    waitingBody:
      "Leave this tab open while you finish approval. It checks every few seconds and again as soon as you switch back here. Your first module opens automatically once Claude is connected.",
    connectedTitle: "Claude is connected",
    connectedBody: "Opening your first module.",

    // Disconnect here ends server access; removing the connector in Claude does not.
    disconnectTitle: "Disconnect Claude",
    disconnectBody:
      "Ends Claude's access to this workspace. The connector stays in your Claude settings, and reconnecting means approving access again.",
    disconnectDone: "Claude no longer has access to this workspace.",

    statusLastActivity: "Claude last used it",
    statusActiveNote:
      "Claude used your workspace in the last few minutes, so everything is working.",
    statusNeverUsedNote:
      "Claude has access but hasn't used it yet. Your first module will be the first thing that does.",
    statusIdleNote:
      "Claude hasn't used your workspace recently, which usually just means it's closed. Ask it to do something here, then refresh.",

    // End access on this page — removing the connector in Claude has no effect here.
    privacyBody:
      "Claude can read module questions, save your answers, and store the documents you produce. We cannot see your Claude conversations. Everything Claude does here is recorded, and you can end access from this page at any time.",

    handoff: {
      openCta: "Continue in Claude",
      retryCta: "Retry in Claude",
      // claude:// does nothing visible without the desktop app — phrase fallback as a symptom.
      hint: "Opens the Claude desktop app with your message ready to send.",
      fallbackPrefix: "Nothing happened?",
      fallbackLink: "Open in your browser",
    },
  },

  // "openai" is the value the check constraint stores; ChatGPT is the only
  // name a founder ever sees.
  openai: {
    name: "ChatGPT",
    title: "Connect ChatGPT",
    titleConnected: "ChatGPT connection",
    // Three minutes, not two: this route has more manual navigation than
    // Claude's, because nothing deep-links past the settings window.
    intro:
      "Connect ChatGPT once. It takes about three minutes, and your first module opens as soon as you're done.",
    introConnected:
      "ChatGPT is connected to this workspace. Everything below is here if you want to check on it or end access.",
    expiredBody:
      "Your saved work is safe. Use Repair connection below to set ChatGPT up again with the same address.",

    setupTitle: "Add the server in ChatGPT",
    setupBody: "Five steps, once. You'll approve access at the end.",

    manualSteps: [
      {
        title: "Open settings in the ChatGPT desktop app",
        body: "The connection lives in the desktop app. It can't be set up at chatgpt.com.",
        linkLabel: "Open ChatGPT settings",
        illustration: "chatgpt-settings",
      },
      {
        title: "Open Plugins, then the MCPs tab",
        body: "Plugins sits under Integrations. Once it opens, switch to the MCPs tab.",
        illustration: "chatgpt-plugins",
      },
      {
        title: "Add a server",
        body: "Choose Add server, then Connect to a custom MCP.",
        illustration: "chatgpt-add-server",
      },
      {
        title: "Name it, choose Streamable HTTP, and paste this address",
        // STDIO is the default and hides the URL field, which reads as the
        // form being broken rather than as the wrong type being selected.
        body: 'Call it anything — "AI Catalyst" works. The type must be Streamable HTTP, not STDIO. Leave the token and header fields empty.',
        showAddress: true,
        illustration: "chatgpt-custom-mcp",
      },
      {
        title: "Save, then approve access",
        body: "ChatGPT opens your browser to finish. Sign in there with the email you use here, then approve.",
        illustration: "chatgpt-approve",
      },
    ],

    // No settingsFallback*: Plugins and MCPs exist only in the desktop app,
    // so there is no browser URL to offer. The step renders no fallback.

    troubleshooting: [
      {
        symptom: "Nothing happened when you opened settings",
        fix: "The link only works when the ChatGPT desktop app is installed. Open the app yourself and go to Settings, then carry on from step 2.",
      },
      {
        symptom: "There's no Plugins or MCPs anywhere",
        fix: "You're in the browser. Plugins, and the MCPs tab inside it, only exist in the ChatGPT desktop app — chatgpt.com has neither.",
      },
      {
        symptom: "It's asking for a command instead of an address",
        fix: "The type is still set to STDIO, which is for servers running on your own machine. Switch it to Streamable HTTP and the address field appears.",
      },
      // ChatGPT approves in an isolated window with no session — see the
      // comment in app/oauth/continue/route.ts. This is where founders stall.
      {
        symptom: "The approval page asks you to sign in",
        fix: "ChatGPT opens approval in its own window, which doesn't share your browser session. Sign in with the same email you use here, then approve.",
      },
      {
        symptom: "You approved access, but this page hasn't moved",
        fix: "Come back to this tab and leave it open for a few seconds. It checks while you're looking at it.",
      },
    ],

    waitingTitle: "Waiting for ChatGPT",
    waitingBody:
      "Leave this tab open while you finish approval. It checks every few seconds and again as soon as you switch back here. Your first module opens automatically once ChatGPT is connected.",
    connectedTitle: "ChatGPT is connected",
    connectedBody: "Opening your first module.",

    disconnectTitle: "Disconnect ChatGPT",
    disconnectBody:
      "Ends ChatGPT's access to this workspace. The server stays in your ChatGPT settings, and reconnecting means approving access again.",
    disconnectDone: "ChatGPT no longer has access to this workspace.",

    statusLastActivity: "ChatGPT last used it",
    statusActiveNote:
      "ChatGPT used your workspace in the last few minutes, so everything is working.",
    statusNeverUsedNote:
      "ChatGPT has access but hasn't used it yet. Your first module will be the first thing that does.",
    statusIdleNote:
      "ChatGPT hasn't used your workspace recently, which usually just means it's closed. Ask it to do something here, then refresh.",

    privacyBody:
      "ChatGPT can read module questions, save your answers, and store the documents you produce. We cannot see your ChatGPT conversations. Everything ChatGPT does here is recorded, and you can end access from this page at any time.",

    handoff: {
      openCta: "Continue in ChatGPT",
      retryCta: "Retry in ChatGPT",
      // No fallback line: unlike Claude, there is no browser URL to offer
      // underneath — a chat at chatgpt.com has no route to this
      // workspace's MCP connector, desktop app installed or not.
      //
      // Work mode called out on purpose: it's the surface the MCP
      // connector actually runs in, and a founder landing in an ordinary
      // chat has no obvious reason to switch before sending the message.
      hint: "Opens the ChatGPT desktop app with your message ready to send. We recommend using Work mode.",
    },
  },
};

// ── Handing over to the assistant ───────────────────────────────────────

// Neutral half of the hand-off card. The provider-specific half is
// `assistantCopy[provider].handoff`.
export const handoffCopy = {
  promptLabel: "Send this",
  copyLabel: "Copy",
  copyCta: "Copy the message",
  copyRetryCta: "Copy it again",
} as const;
