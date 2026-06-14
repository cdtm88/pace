import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-2xl font-semibold text-foreground">Pace</h1>
      <p className="text-muted-foreground text-sm">AI-assisted cycling training</p>
      <Link
        href="/login"
        className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Sign in
      </Link>
    </main>
  );
}
