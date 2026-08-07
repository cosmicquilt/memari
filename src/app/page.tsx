import { SignInButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

async function getDbStatus() {
  try {
    const count = await prisma.user.count();
    return { connected: true as const, count };
  } catch (err) {
    return {
      connected: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function Home() {
  const db = await getDbStatus();
  const clerkConfigured = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  );
  const { userId } = await auth();

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-xl flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-10 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Memari — pipeline check
        </h1>

        <section className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div>
            <p className="font-medium text-black dark:text-zinc-50">Auth (Clerk)</p>
            <p className="text-sm text-zinc-500">
              {clerkConfigured ? "Keys configured" : "No Clerk keys set yet"}
            </p>
          </div>
          {userId ? <UserButton /> : <SignInButton />}
        </section>

        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="font-medium text-black dark:text-zinc-50">Database (Postgres via Prisma)</p>
          {db.connected ? (
            <p className="text-sm text-green-600 dark:text-green-400">
              Connected — {db.count} user row(s) found.
            </p>
          ) : (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Not connected yet: {db.error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
