import Link from "next/link";

export default function LeaderboardNotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Group not found</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">This leaderboard does not exist or the link is wrong.</p>
      <Link href="/" className="text-sm font-medium text-zinc-950 underline dark:text-zinc-50">
        Back home
      </Link>
    </div>
  );
}
