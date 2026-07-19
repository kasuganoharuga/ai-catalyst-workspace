export default function AppLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-6 py-14">
      <div className="h-8 w-48 rounded-md bg-muted" />
      <div className="mt-4 h-5 w-full max-w-xl rounded-md bg-muted" />
      <div className="mt-10 h-40 rounded-[2rem] bg-muted" />
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="h-32 rounded-[2rem] bg-muted" />
        <div className="h-32 rounded-[2rem] bg-muted" />
      </div>
    </div>
  );
}
