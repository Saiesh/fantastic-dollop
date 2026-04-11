"use client";

import { useActionState } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

import {
  getLeagueTeamsForInvite,
  joinGroupWithInvite,
  type JoinGroupResult,
} from "@/lib/actions/auth";

async function submitJoin(
  _prev: JoinGroupResult | null,
  formData: FormData,
): Promise<JoinGroupResult | null> {
  const inviteCode = String(formData.get("inviteCode") ?? "");
  const rawName = formData.get("displayName");
  const displayName =
    rawName != null && String(rawName).trim() !== ""
      ? String(rawName)
      : undefined;
  const rawHome = formData.get("homeTeamId");
  const homeTeamId =
    rawHome != null && String(rawHome).trim() !== ""
      ? String(rawHome)
      : undefined;
  const rawPassword = formData.get("password");
  const password =
    rawPassword != null && String(rawPassword) !== ""
      ? String(rawPassword)
      : undefined;
  return joinGroupWithInvite({ inviteCode, displayName, homeTeamId, password });
}

interface JoinFormProps {
  /** Why: password is collected only for new joins; signed-in users join additional groups without re-entering it. */
  isSignedIn: boolean;
}

export function JoinForm({ isSignedIn }: JoinFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(submitJoin, null);
  const redirected = useRef(false);

  const [inviteCode, setInviteCode] = useState("");
  const [teams, setTeams] = useState<
    { id: string; name: string; shortName: string }[] | null
  >(null);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [homeTeamId, setHomeTeamId] = useState("");
  // Why: gate submit until password meets server rules when the field is shown (no session).
  const [password, setPassword] = useState("");

  const handleInviteChange = (value: string) => {
    setInviteCode(value);
    // Why: reset roster state when the code is too short — done here so we avoid sync setState in useEffect (eslint).
    if (value.trim().length < 3) {
      setTeams(null);
      setHomeTeamId("");
      setTeamsLoading(false);
    }
  };

  // Why: load the league roster after the invite resolves so the player can pick a mandatory home team.
  useEffect(() => {
    const code = inviteCode.trim();
    if (code.length < 3) {
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      setTeamsLoading(true);
      void getLeagueTeamsForInvite(code)
        .then((res) => {
          if (cancelled) return;
          if (res.ok) {
            setTeams(res.teams);
            setHomeTeamId("");
          } else {
            setTeams(null);
            setHomeTeamId("");
          }
        })
        .finally(() => {
          setTeamsLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [inviteCode]);

  // Why: navigate after a successful join so the URL reflects the group context.
  useEffect(() => {
    if (state?.ok && !redirected.current) {
      redirected.current = true;
      router.push(`/group/${state.groupId}`);
    }
  }, [state, router]);

  const needsHomePick = teams !== null && teams.length > 0;
  const homePickReady = !needsHomePick || homeTeamId.length > 0;
  const passwordReady = isSignedIn || password.trim().length >= 4;

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="inviteCode" className="text-sm font-medium">
          Invite code
        </label>
        <input
          id="inviteCode"
          name="inviteCode"
          type="text"
          required
          autoComplete="off"
          value={inviteCode}
          onChange={(e) => handleInviteChange(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
          placeholder="e.g. FANX7K"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="homeTeamId" className="text-sm font-medium">
          Home team (this league)
        </label>
        {teamsLoading ? (
          <p className="text-xs text-muted-foreground">Loading teams…</p>
        ) : needsHomePick ? (
          <select
            id="homeTeamId"
            name="homeTeamId"
            required
            value={homeTeamId}
            onChange={(e) => setHomeTeamId(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground"
          >
            <option value="">Select your franchise</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.shortName})
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-muted-foreground">
            Enter a valid invite code (at least 3 characters) to load this
            league&apos;s teams.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          You earn points when your home team wins. The pick locks once the
          first match begins (see Rules).
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="displayName" className="text-sm font-medium">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          maxLength={50}
          autoComplete="nickname"
          className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
          placeholder="How you appear on the leaderboard"
          onChange={(e) => {
            // Why: `/login` reads this so players only type their name once (on join), not again on sign-in.
            try {
              sessionStorage.setItem("fanbet_pending_display_name", e.target.value);
            } catch {
              /* ignore quota / private mode */
            }
          }}
        />
        <p className="text-xs text-muted-foreground">
          Pick a name other players will see. If you already have an account,
          log in first — you can&apos;t take a name registered with a password.
        </p>
      </div>
      {!isSignedIn ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="join-password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="join-password"
            name="password"
            type="password"
            required
            minLength={4}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
            placeholder="At least 4 characters — use this to log in later"
          />
          <p className="text-xs text-muted-foreground">
            You&apos;ll use this with your display name on the login page if your
            session expires.
          </p>
        </div>
      ) : null}
      {state != null && !state.ok ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending || teamsLoading || !homePickReady || !passwordReady}
        className={cn(
          "rounded-lg px-4 py-3 text-sm font-semibold transition-colors",
          "bg-accent text-accent-foreground hover:bg-accent/90",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {isPending ? "Joining…" : "Join group"}
      </button>
    </form>
  );
}
