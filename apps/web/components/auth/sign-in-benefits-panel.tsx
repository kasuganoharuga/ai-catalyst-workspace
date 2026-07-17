import { Check } from "lucide-react";

const BENEFITS = [
  "Access the right modules for your stage",
  "Complete AI-guided activities through your connected AI client",
  "Save progress and outputs securely to your workspace",
  "Track progress and review status",
];

export function SignInBenefitsPanel() {
  return (
    <div className="flex flex-1 items-center justify-center bg-surface-inverse px-6 py-16 text-surface-inverse-foreground sm:px-12 lg:px-16">
      <div className="w-full max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-lime">
          AI Catalyst Workspace
        </p>
        <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight">
          A guided founder workflow that keeps every module, output and review
          status in one place.
        </h2>
        <ul className="mt-8 space-y-4">
          {BENEFITS.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm leading-6">
              <Check
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-brand-lime"
              />
              <span className="text-surface-inverse-foreground/90">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
