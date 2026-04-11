import { CreateLeagueForm } from "@/components/admin/create-league-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create League | IPL FanBet Admin",
};

export default function CreateLeaguePage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Create League</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up a new tournament. You&apos;ll be the Super Admin.
        </p>
      </div>
      <CreateLeagueForm />
    </div>
  );
}
