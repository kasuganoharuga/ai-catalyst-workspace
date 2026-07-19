import { redirect } from "next/navigation";

import { safeReturnTo } from "@/lib/safe-return-to";

// Kept only for old bookmarks/links — "/" is the canonical sign-in page.
type LoginPageProps = {
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { returnTo } = await searchParams;
  const safeTo = safeReturnTo(returnTo);

  redirect(safeTo ? `/?returnTo=${encodeURIComponent(safeTo)}` : "/");
}
