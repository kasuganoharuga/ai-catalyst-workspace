// The two not-authorised failure states (expired connection, no configured
// endpoint) render the same panel shape — only the title and body differ.
export function ConnectionErrorPanel({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <section className="mt-10 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </section>
  );
}
