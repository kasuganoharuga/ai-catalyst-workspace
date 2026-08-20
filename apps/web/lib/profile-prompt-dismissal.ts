import { cookies } from "next/headers";

// Where "I'll do this later" is remembered.
//
// A cookie rather than a column: skipping the profile step is a
// presentation preference, not part of the founder's record, and it should
// not survive into anyone's data model or reporting. One year because the
// prompt is only ever shown to someone who hasn't filled their name in —
// if they do fill it in, the cookie stops mattering entirely.
const COOKIE_NAME = "ai-catalyst.profile-prompt-skipped";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function hasSkippedProfilePrompt(): Promise<boolean> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value === "1";
}

export async function setProfilePromptSkipped(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "1", {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    httpOnly: true,
  });
}
