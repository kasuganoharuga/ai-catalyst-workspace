import { ComingSoonBadge } from "./coming-soon-badge";

const SETUP_STEPS = [
  {
    title: "Connect your AI assistant",
    description: "Claude or ChatGPT, via the AI Catalyst MCP tool",
  },
  {
    title: "Complete Module 0",
    description: "Founder Workspace Setup",
  },
  {
    title: "Sync your Founder Context Profile",
    description: "To your connected Drive",
  },
  {
    title: "Unlock Module 1",
    description: "Pressure-Test Your Idea",
  },
];

// A roadmap preview of the intended setup flow, not a tracker: none of
// these steps have real per-user completion state yet (Drive sync and
// Module-attempt tracking are both unbuilt), so no step is marked as
// "current" or "done".
export function WorkspaceSetupCard() {
  return (
    <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Workspace setup
        </p>
        <ComingSoonBadge />
      </div>
      <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {SETUP_STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {step.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
