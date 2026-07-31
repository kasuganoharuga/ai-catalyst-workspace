import { redirect } from "next/navigation";

import { safeReturnTo } from "@/lib/safe-return-to";

// Kept only for old bookmarks/links — "/" is the canonical sign-in page.
type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  // Legacy mcp() loginPage bookmarks may still carry authorize query params.
  const clientId = Array.isArray(params.client_id)
    ? params.client_id[0]
    : params.client_id;

  if (clientId) {
    const forwarded = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "returnTo") continue;
      const single = Array.isArray(value) ? value[0] : value;
      if (typeof single === "string") {
        forwarded.set(key, single);
      }
    }
    redirect(`/oauth/continue?${forwarded.toString()}`);
  }

  const safeTo = safeReturnTo(params.returnTo);

  redirect(safeTo ? `/?returnTo=${encodeURIComponent(safeTo)}` : "/");
}
