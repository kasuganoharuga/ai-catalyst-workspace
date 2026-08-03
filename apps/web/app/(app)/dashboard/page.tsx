import { getCurrentAppActor } from "@/lib/current-app-actor";
import { appPageTitle } from "@/lib/page-metadata";

import { FounderDashboard } from "./founder-dashboard";
import { MentorDashboard } from "./mentor-dashboard";

export async function generateMetadata() {
  const actor = await getCurrentAppActor();
  return appPageTitle(actor.role === "mentor" ? "My founders" : "Dashboard");
}

/**
 * The one URL both Founder and Mentor land on (see ROLE_DESTINATION in
 * app/page.tsx and both roles' shared /dashboard nav item in nav-items.ts).
 * Deliberately a thin dispatcher — FounderDashboard and MentorDashboard
 * each still call their own role-specific actor loader and were previously
 * two separate pages, so nothing about the render logic itself needed to
 * change to live behind one URL.
 */
export default async function DashboardPage() {
  const actor = await getCurrentAppActor();

  if (actor.role === "mentor") {
    return <MentorDashboard />;
  }

  return <FounderDashboard />;
}
