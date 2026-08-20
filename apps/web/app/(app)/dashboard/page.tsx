import { getCurrentAppActor } from "@/lib/current-app-actor";
import { appPageTitle } from "@/lib/page-metadata";

import { FounderDashboard } from "./founder-dashboard";
import { MentorDashboard } from "./mentor-dashboard";

export const metadata = appPageTitle("Dashboard");

/**
 * Shared landing URL for Founder and Mentor (see ROLE_DESTINATION in
 * app/page.tsx). Thin dispatcher — each role's dashboard still loads its
 * own actor. Mentor founder directory is /founders, not this page.
 */
export default async function DashboardPage() {
  const actor = await getCurrentAppActor();

  if (actor.role === "mentor") {
    return <MentorDashboard />;
  }

  return <FounderDashboard />;
}
