"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  removePlayerFromLeague,
  banPlayerFromLeague,
  unbanPlayerFromLeague,
  addPlayerToGroup,
} from "@/lib/actions/admin";
import type { MemberRole } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Types — serialisable props passed from the server component.
// ---------------------------------------------------------------------------

interface PlayerRow {
  id: string;
  userId: string;
  role: MemberRole;
  hasPaid: boolean;
  joinedAt: string;
  user: { displayName: string; avatarUrl: string | null };
  group: { id: string; name: string };
  homeTeam: { id: string; name: string; shortName: string };
}

interface BanRow {
  id: string;
  userId: string;
  leagueId: string;
  reason: string | null;
  createdAt: string;
  user: { displayName: string };
}

interface GroupOption {
  id: string;
  name: string;
}

interface TeamOption {
  id: string;
  name: string;
  shortName: string;
}

interface PlayerManagementProps {
  leagueId: string;
  players: PlayerRow[];
  bans: BanRow[];
  groups: GroupOption[];
  teams: TeamOption[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function PlayerManagement({
  leagueId,
  players,
  bans,
  groups,
  teams,
  className,
}: PlayerManagementProps) {
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  return (
    <div className={cn("space-y-8", className)}>
      {/* Feedback toast */}
      {message && (
        <div
          className={cn(
            "rounded-lg px-4 py-3 text-sm font-medium",
            message.type === "success"
              ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
          )}
        >
          {message.text}
        </div>
      )}

      {/* Add player form */}
      {groups.length > 0 && teams.length > 0 && (
        <AddPlayerForm
          groups={groups}
          teams={teams}
          onResult={setMessage}
        />
      )}

      {/* Active players */}
      <PlayerTable
        leagueId={leagueId}
        players={players}
        onResult={setMessage}
      />

      {/* Banned players */}
      <BannedSection
        leagueId={leagueId}
        bans={bans}
        onResult={setMessage}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player table
// ---------------------------------------------------------------------------

interface PlayerTableProps {
  leagueId: string;
  players: PlayerRow[];
  onResult: (msg: { type: "success" | "error"; text: string }) => void;
}

function PlayerTable({ leagueId, players, onResult }: PlayerTableProps) {
  if (players.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <p className="text-sm font-medium text-foreground">No players yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Players will appear here after joining a group.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold">
          Active Members{" "}
          <span className="font-normal text-muted-foreground">({players.length})</span>
        </h3>
      </div>

      {/* Why: table gives the best layout for tabular player data on wider screens. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
              <th className="px-5 py-3">Player</th>
              <th className="px-5 py-3">Group</th>
              <th className="px-5 py-3">Home Team</th>
              <th className="px-5 py-3">Paid</th>
              <th className="px-5 py-3">Joined</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {players.map((player) => (
              <PlayerTableRow
                key={player.id}
                leagueId={leagueId}
                player={player}
                onResult={onResult}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single player row
// ---------------------------------------------------------------------------

interface PlayerTableRowProps {
  leagueId: string;
  player: PlayerRow;
  onResult: (msg: { type: "success" | "error"; text: string }) => void;
}

function PlayerTableRow({ leagueId, player, onResult }: PlayerTableRowProps) {
  const [isPending, startTransition] = useTransition();
  // Why: ban modal needs a text field for a reason, so we track its open state separately.
  const [isBanOpen, setIsBanOpen] = useState(false);
  const [banReason, setBanReason] = useState("");

  function handleRemove() {
    // Why: destructive action needs explicit confirmation to prevent accidental removal.
    if (!window.confirm(`Remove ${player.user.displayName} from the league? All their bets, points, and streaks in this group will be deleted.`)) {
      return;
    }
    startTransition(async () => {
      const res = await removePlayerFromLeague({ membershipId: player.id });
      if (res.error) {
        onResult({ type: "error", text: res.error });
      } else {
        onResult({ type: "success", text: `${player.user.displayName} removed.` });
      }
    });
  }

  function handleBan() {
    startTransition(async () => {
      const res = await banPlayerFromLeague({
        userId: player.userId,
        leagueId,
        reason: banReason.trim() || null,
      });
      if (res.error) {
        onResult({ type: "error", text: res.error });
      } else {
        onResult({ type: "success", text: `${player.user.displayName} banned from the league.` });
      }
      setIsBanOpen(false);
      setBanReason("");
    });
  }

  return (
    <>
      <tr className="hover:bg-muted/50 transition-colors">
        <td className="px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
              {player.user.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium">{player.user.displayName}</p>
              {player.role === "organiser" && (
                <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                  ORGANISER
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="px-5 py-3 text-muted-foreground">{player.group.name}</td>
        <td className="px-5 py-3">
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
            {player.homeTeam.shortName}
          </span>
        </td>
        <td className="px-5 py-3">
          {player.hasPaid ? (
            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Paid
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
              Unpaid
            </span>
          )}
        </td>
        <td className="px-5 py-3 text-xs text-muted-foreground">
          {new Date(player.joinedAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </td>
        <td className="px-5 py-3 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={handleRemove}
              disabled={isPending}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                "border border-border hover:border-red-300 hover:bg-red-50 hover:text-red-700",
                "dark:hover:border-red-700 dark:hover:bg-red-950/20 dark:hover:text-red-400",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
              aria-label={`Remove ${player.user.displayName}`}
            >
              {isPending ? "…" : "Remove"}
            </button>
            <button
              type="button"
              onClick={() => setIsBanOpen(!isBanOpen)}
              disabled={isPending}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                "bg-red-100 text-red-700 hover:bg-red-200",
                "dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
              aria-label={`Ban ${player.user.displayName}`}
            >
              Ban
            </button>
          </div>
        </td>
      </tr>

      {/* Why: inline ban form avoids a separate modal; opens directly below the row for context. */}
      {isBanOpen && (
        <tr>
          <td colSpan={6} className="bg-red-50/50 px-5 py-4 dark:bg-red-950/10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label
                  htmlFor={`ban-reason-${player.id}`}
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  Ban reason (optional)
                </label>
                <input
                  id={`ban-reason-${player.id}`}
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="e.g. Repeated rule violations"
                  className={cn(
                    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
                    "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-red-300 dark:focus:ring-red-700",
                  )}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleBan}
                  disabled={isPending}
                  className={cn(
                    "rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {isPending ? "Banning…" : "Confirm Ban"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsBanOpen(false);
                    setBanReason("");
                  }}
                  className="rounded-md border border-border px-4 py-2 text-xs font-medium transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Banned players section
// ---------------------------------------------------------------------------

interface BannedSectionProps {
  leagueId: string;
  bans: BanRow[];
  onResult: (msg: { type: "success" | "error"; text: string }) => void;
}

function BannedSection({ leagueId, bans, onResult }: BannedSectionProps) {
  if (bans.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/30 text-card-foreground dark:border-red-900/50 dark:bg-red-950/10">
      <div className="border-b border-red-200 px-5 py-4 dark:border-red-900/50">
        <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">
          Banned Players{" "}
          <span className="font-normal text-red-600/70 dark:text-red-400/70">({bans.length})</span>
        </h3>
      </div>
      <ul className="divide-y divide-red-100 dark:divide-red-900/30">
        {bans.map((ban) => (
          <BannedRow
            key={ban.id}
            leagueId={leagueId}
            ban={ban}
            onResult={onResult}
          />
        ))}
      </ul>
    </div>
  );
}

interface BannedRowProps {
  leagueId: string;
  ban: BanRow;
  onResult: (msg: { type: "success" | "error"; text: string }) => void;
}

function BannedRow({ leagueId, ban, onResult }: BannedRowProps) {
  const [isPending, startTransition] = useTransition();

  function handleUnban() {
    startTransition(async () => {
      const res = await unbanPlayerFromLeague({ userId: ban.userId, leagueId });
      if (res.error) {
        onResult({ type: "error", text: res.error });
      } else {
        onResult({ type: "success", text: `${ban.user.displayName} unbanned.` });
      }
    });
  }

  return (
    <li className="flex items-center justify-between px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{ban.user.displayName}</p>
        {ban.reason && (
          <p className="mt-0.5 text-xs text-muted-foreground">{ban.reason}</p>
        )}
        <p className="mt-0.5 text-[10px] text-muted-foreground/70">
          Banned{" "}
          {new Date(ban.createdAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      </div>
      <button
        type="button"
        onClick={handleUnban}
        disabled={isPending}
        className={cn(
          "shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors",
          "hover:border-green-300 hover:bg-green-50 hover:text-green-700",
          "dark:hover:border-green-700 dark:hover:bg-green-950/20 dark:hover:text-green-400",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
        aria-label={`Unban ${ban.user.displayName}`}
      >
        {isPending ? "…" : "Unban"}
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Add player form
// ---------------------------------------------------------------------------

interface AddPlayerFormProps {
  groups: GroupOption[];
  teams: TeamOption[];
  onResult: (msg: { type: "success" | "error"; text: string }) => void;
}

function AddPlayerForm({ groups, teams, onResult }: AddPlayerFormProps) {
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  // Why: admin types a user ID directly — there is no user search endpoint yet.
  const [userId, setUserId] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [homeTeamId, setHomeTeamId] = useState(teams[0]?.id ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId.trim() || !groupId || !homeTeamId) return;

    startTransition(async () => {
      const res = await addPlayerToGroup({ userId: userId.trim(), groupId, homeTeamId });
      if (res.error) {
        onResult({ type: "error", text: res.error });
      } else {
        onResult({ type: "success", text: "Player added successfully." });
        setUserId("");
      }
    });
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          "w-full rounded-xl border-2 border-dashed border-border py-4 text-sm font-medium text-muted-foreground transition-colors",
          "hover:border-accent hover:text-accent",
        )}
      >
        + Add Player to Group
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-card p-5 text-card-foreground"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Add Player</h3>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {/* User ID */}
        <div>
          <label htmlFor="add-player-user-id" className="mb-1 block text-xs font-medium text-muted-foreground">
            User ID
          </label>
          <input
            id="add-player-user-id"
            type="text"
            required
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="cuid..."
            className={cn(
              "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
              "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/40",
            )}
          />
        </div>

        {/* Group select */}
        <div>
          <label htmlFor="add-player-group" className="mb-1 block text-xs font-medium text-muted-foreground">
            Group
          </label>
          <select
            id="add-player-group"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className={cn(
              "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-accent/40",
            )}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {/* Home team select */}
        <div>
          <label htmlFor="add-player-team" className="mb-1 block text-xs font-medium text-muted-foreground">
            Home Team
          </label>
          <select
            id="add-player-team"
            value={homeTeamId}
            onChange={(e) => setHomeTeamId(e.target.value)}
            className={cn(
              "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
              "focus:outline-none focus:ring-2 focus:ring-accent/40",
            )}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.shortName})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={isPending || !userId.trim()}
          className={cn(
            "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {isPending ? "Adding…" : "Add Player"}
        </button>
      </div>
    </form>
  );
}
