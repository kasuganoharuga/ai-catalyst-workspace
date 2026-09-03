export function IssuedInvitationCredentials({
  heading,
  loginUrl,
  email,
  password,
  note,
}: {
  heading: string;
  loginUrl: string;
  email: string;
  password: string;
  note: string;
}) {
  return (
    <div className="mt-5 rounded-xl border border-accent bg-accent p-4 sm:max-w-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-foreground">
        {heading}
      </p>
      <dl className="mt-3 space-y-2 font-mono text-sm text-foreground">
        <div>
          <dt className="text-xs text-muted-foreground">Login</dt>
          <dd className="break-all">{loginUrl}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Account</dt>
          <dd className="break-all">{email}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Password</dt>
          <dd className="break-all">{password}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
