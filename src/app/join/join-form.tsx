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

type TeamRow = { id: string; name: string; shortName: string; primaryColor: string | null };

const inputClass =
  "w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/25";

export function JoinForm({ isSignedIn }: JoinFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(submitJoin, null);
  const redirected = useRef(false);

  const [inviteCode, setInviteCode] = useState("");
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [teamsLoading, setTeamsLoading] = useState(false);
  /** Why: surfaced when getLeagueTeamsForInvite throws so mobile/network failures are visible instead of a silent empty state. */
  const [teamsError, setTeamsError] = useState<string | null>(null);
  /** Why: bumping this re-runs the invite effect so "Try again" retries without changing the code. */
  const [teamsLoadRetry, setTeamsLoadRetry] = useState(0);
  const [homeTeamId, setHomeTeamId] = useState("");
  const [password, setPassword] = useState("");

  const handleInviteChange = (value: string) => {
    setInviteCode(value);
    if (value.trim().length < 3) {
      setTeams(null);
      setHomeTeamId("");
      setTeamsLoading(false);
      setTeamsError(null);
    }
  };

  useEffect(() => {
    const code = inviteCode.trim();
    if (code.length < 3) {
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      setTeamsLoading(true);
      setTeamsError(null);
      void getLeagueTeamsForInvite(code)
        .then((res) => {
          if (cancelled) return;
          if (res.ok) {
            setTeams(res.teams);
            setHomeTeamId("");
            setTeamsError(null);
          } else {
            setTeams(null);
            setHomeTeamId("");
          }
        })
        .catch(() => {
          if (cancelled) return;
          setTeams(null);
          setHomeTeamId("");
          setTeamsError(
            "Couldn't load teams. Check your connection, then try again.",
          );
        })
        .finally(() => {
          if (!cancelled) {
            setTeamsLoading(false);
          }
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [inviteCode, teamsLoadRetry]);

  useEffect(() => {
    if (state?.ok && !redirected.current) {
      redirected.current = true;
      router.push(`/group/${state.groupId}`);
    }
  }, [state, router]);

  const needsHomePick = teams !== null && teams.length > 0;
  const homePickReady = !needsHomePick || homeTeamId.length > 0;
  /** Why: after a failed team load we must not allow submit until a retry succeeds (otherwise the server rejects with a confusing team message). */
  const teamsLoadBlockedSubmit =
    teamsError != null && inviteCode.trim().length >= 3;
  const passwordReady = isSignedIn || password.trim().length >= 4;

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="homeTeamId" value={homeTeamId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="inviteCode" className="text-sm font-medium text-foreground">
          Invite code
        </label>
        <input
          id="inviteCode"
          name="inviteCode"
          type="text"
          required
          autoComplete="off"
          // Why: iOS/Android keyboards often autocorrect or “fix” short tokens; invite codes must stay exact for the debounced fetch.
          autoCorrect="off"
          spellCheck={false}
          // Why: matches server normalization (uppercase) so the visible value aligns with what users expect from codes like FANX7K.
          autoCapitalize="characters"
          enterKeyHint="done"
          inputMode="text"
          value={inviteCode}
          onChange={(e) => handleInviteChange(e.target.value)}
          className={inputClass}
          placeholder="e.g. FANX7K"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Home team (this league)</span>
        {teamsLoading ? (
          <p className="text-xs text-muted-foreground">Loading teams…</p>
        ) : teamsError != null && inviteCode.trim().length >= 3 ? (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <p className="text-xs text-destructive" role="alert">
              {teamsError}
            </p>
            <button
              type="button"
              className="self-start text-xs font-medium text-accent underline underline-offset-2 hover:brightness-110"
              onClick={() => setTeamsLoadRetry((n) => n + 1)}
            >
              Tap to retry
            </button>
          </div>
        ) : needsHomePick ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {teams.map((t) => {
              const selected = homeTeamId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setHomeTeamId(t.id)}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center rounded-xl border-2 px-2 py-2 text-center text-xs font-bold transition",
                    selected
                      ? "border-accent bg-accent/15 text-foreground ring-2 ring-accent/30"
                      : "border-border bg-muted/30 text-muted-foreground hover:border-accent/40 hover:bg-muted/50",
                  )}
                  style={
                    t.primaryColor
                      ? {
                          borderLeftWidth: 4,
                          borderLeftColor: t.primaryColor,
                        }
                      : undefined
                  }
                >
                  <span className="text-sm font-bold text-foreground">{t.shortName}</span>
                  <span className="mt-0.5 line-clamp-2 text-[0.65rem] font-normal leading-tight text-muted-foreground">
                    {t.name}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Enter a valid invite code (at least 3 characters) to load this league&apos;s teams.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          You earn points when your home team wins. The pick locks once the first match begins (see Rules).
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="displayName" className="text-sm font-medium text-foreground">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          maxLength={50}
          autoComplete="nickname"
          className={inputClass}
          placeholder="How you appear on the leaderboard"
          onChange={(e) => {
            try {
              sessionStorage.setItem("fanbet_pending_display_name", e.target.value);
            } catch {
              /* ignore */
            }
          }}
        />
        <p className="text-xs text-muted-foreground">
          Pick a name other players will see. If you already have an account, log in first — you
          can&apos;t take a name registered with a password.
        </p>
      </div>

      {!isSignedIn ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="join-password" className="text-sm font-medium text-foreground">
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
            className={inputClass}
            placeholder="At least 4 characters — use this to log in later"
          />
          <p className="text-xs text-muted-foreground">
            You&apos;ll use this with your display name on the login page if your session expires.
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
        disabled={
          isPending ||
          teamsLoading ||
          teamsLoadBlockedSubmit ||
          !homePickReady ||
          !passwordReady
        }
        className={cn(
          "rounded-xl bg-gradient-to-r from-accent to-amber-500 px-4 py-3 text-sm font-bold text-accent-foreground shadow-md shadow-amber-900/25 transition hover:brightness-110",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {isPending ? "Joining…" : "Join group"}
      </button>
    </form>
  );
}
