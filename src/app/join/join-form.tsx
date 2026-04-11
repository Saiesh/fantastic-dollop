"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

import {
  joinGroupWithInvite,
  type JoinGroupResult,
  type LeagueTeamsForInviteErrorCode,
  type LeagueTeamsForInviteResult,
} from "@/lib/actions/auth";

/** Why: maps server error codes to copy users can act on (fix code vs organiser vs retry). */
function messageForTeamsLoadError(
  code: LeagueTeamsForInviteErrorCode | "MISSING_INVITE_CODE",
): string {
  switch (code) {
    case "INVALID_INVITE":
      return "That invite code is not valid. Check for typos or ask your organiser for a new code.";
    case "MISSING_INVITE_CODE":
      return "Invite code is required.";
    case "NO_TEAMS":
      return "This league has no teams linked yet. Ask your organiser to finish league setup before players join.";
    case "LOAD_FAILED":
      return "Could not load teams right now. Try again in a moment; if it keeps failing, contact support or your organiser.";
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
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
  const redirected = useRef(false);
  /** Why: browsers can autofill the invite field without firing `onChange`, leaving React state empty while the input looks filled — the ref lets us reconcile DOM → state. */
  const inviteInputRef = useRef<HTMLInputElement>(null);

  const [inviteCode, setInviteCode] = useState("");
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [teamsLoading, setTeamsLoading] = useState(false);
  /** Why: invite preview failures (invalid code, empty roster, DB) surface here; transport/framework failures still use .catch below. */
  const [teamsError, setTeamsError] = useState<string | null>(null);
  /** Why: bumping this re-runs the invite effect so "Try again" retries without changing the code. */
  const [teamsLoadRetry, setTeamsLoadRetry] = useState(0);
  const [homeTeamId, setHomeTeamId] = useState("");
  /** Why: avoids React 19 form action wiring; direct await matches login flow and works on iOS Safari. */
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Why: join action validation / business errors after submit. */
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleInviteChange = (value: string) => {
    setInviteCode(value);
    if (value.trim().length < 3) {
      setTeams(null);
      setHomeTeamId("");
      setTeamsLoading(false);
      setTeamsError(null);
    }
  };

  /** Why: password managers / iOS autofill often populate value after first paint without React events. */
  const syncInviteFromDomIfNeeded = useCallback((): void => {
    const el = inviteInputRef.current;
    if (!el) return;
    const domTrimmed = el.value.trim();
    if (domTrimmed.length < 3) return;
    setInviteCode((prev) => (prev.trim() === domTrimmed ? prev : el.value));
  }, []);

  // Why: late autofill can miss both mount and focus; short delayed reads catch most mobile browsers.
  useEffect(() => {
    const t0 = window.setTimeout(syncInviteFromDomIfNeeded, 0);
    const t1 = window.setTimeout(syncInviteFromDomIfNeeded, 500);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [syncInviteFromDomIfNeeded]);

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
      // Why: plain JSON over standard HTTP avoids React server-action transport stalls on iOS Safari; timeout covers slow networks.
      const fetchTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 10_000),
      );
      void Promise.race([
        fetch(`/api/teams?inviteCode=${encodeURIComponent(code)}`),
        fetchTimeout,
      ])
        .then(async (res) => {
          let data: LeagueTeamsForInviteResult | { ok: false; error: "MISSING_INVITE_CODE" };
          try {
            data = (await res.json()) as typeof data;
          } catch {
            if (cancelled) return;
            setTeams(null);
            setHomeTeamId("");
            setTeamsError(
              "Something went wrong loading teams (browser or network). Try again, or refresh the page.",
            );
            return;
          }
          if (cancelled) return;
          if (data.ok) {
            setTeams(data.teams);
            setHomeTeamId("");
            setTeamsError(null);
          } else {
            setTeams(null);
            setHomeTeamId("");
            setTeamsError(messageForTeamsLoadError(data.error));
          }
        })
        .catch(() => {
          if (cancelled) return;
          setTeams(null);
          setHomeTeamId("");
          setTeamsError(
            "Something went wrong loading teams (browser or network). Try again, or refresh the page.",
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

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    setJoinError(null);
    try {
      const formData = new FormData(e.currentTarget);
      const inviteCodeRaw = String(formData.get("inviteCode") ?? "");
      const rawName = formData.get("displayName");
      const displayName =
        rawName != null && String(rawName).trim() !== ""
          ? String(rawName)
          : undefined;
      const rawHome = formData.get("homeTeamId");
      const homeTeamIdRaw =
        rawHome != null && String(rawHome).trim() !== ""
          ? String(rawHome)
          : undefined;
      const rawPassword = formData.get("password");
      const passwordRaw =
        rawPassword != null && String(rawPassword) !== ""
          ? String(rawPassword)
          : undefined;
      const result: JoinGroupResult = await joinGroupWithInvite({
        inviteCode: inviteCodeRaw,
        displayName,
        homeTeamId: homeTeamIdRaw,
        password: passwordRaw,
      });
      if (result.ok) {
        if (!redirected.current) {
          redirected.current = true;
          router.push(`/group/${result.groupId}`);
        }
      } else {
        setJoinError(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const needsHomePick = teams !== null && teams.length > 0;
  const homePickReady = !needsHomePick || homeTeamId.length > 0;
  /** Why: after a failed team load we must not allow submit until a retry succeeds (otherwise the server rejects with a confusing team message). */
  const teamsLoadBlockedSubmit =
    teamsError != null && inviteCode.trim().length >= 3;

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
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
          ref={inviteInputRef}
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
          // Why: Safari sometimes emits `input` for autofill when `change` does not; keep state aligned either way.
          onInput={(e) => handleInviteChange(e.currentTarget.value)}
          onFocus={syncInviteFromDomIfNeeded}
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
          {/* Why: uncontrolled so iOS password manager / keyboard autofill always registers — a
              controlled input can leave React state empty if the browser fills without firing
              a synthetic onChange, which would keep passwordReady false and block submit. */}
          <input
            id="join-password"
            name="password"
            type="password"
            required
            minLength={4}
            autoComplete="new-password"
            className={inputClass}
            placeholder="At least 4 characters — use this to log in later"
          />
          <p className="text-xs text-muted-foreground">
            You&apos;ll use this with your display name on the login page if your session expires.
          </p>
        </div>
      ) : null}

      {joinError != null ? (
        <p className="text-sm text-destructive" role="alert">
          {joinError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={
          isSubmitting ||
          teamsLoading ||
          teamsLoadBlockedSubmit ||
          !homePickReady
        }
        className={cn(
          "rounded-xl bg-gradient-to-r from-accent to-amber-500 px-4 py-3 text-sm font-bold text-accent-foreground shadow-md shadow-amber-900/25 transition hover:brightness-110",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {isSubmitting ? "Joining…" : "Join group"}
      </button>
    </form>
  );
}
