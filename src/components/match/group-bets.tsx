import { cn } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BetType } from "@/generated/prisma";

// --------------------------------------------------------------------------
// Group match bets — server-rendered list with pre/post deadline visibility.
// Why: hide picks before the lock to limit collusion; reveal full grid after.
// --------------------------------------------------------------------------

/** One row from getGroupBetsForMatch — plain fields safe at the RSC boundary. */
export interface GroupBetDisplayRow {
  userId: string;
  displayName: string;
  selectedTeamId: string;
  teamShortName: string;
  betType: BetType;
  hasPalated: boolean;
  palatTeamId: string | null;
}

interface GroupBetsProps {
  currentUserId: string;
  team1: { id: string; shortName: string };
  team2: { id: string; shortName: string };
  /** True once the bet deadline has passed — individual picks become visible. */
  isBettingLocked: boolean;
  totalGroupMembers: number;
  bets: GroupBetDisplayRow[];
  className?: string;
}

function sortByDisplayName(a: GroupBetDisplayRow, b: GroupBetDisplayRow): number {
  return a.displayName.localeCompare(b.displayName, "en-IN", { sensitivity: "base" });
}

interface PickRowProps {
  bet: GroupBetDisplayRow;
  isCurrentUser: boolean;
}

/** Single name line with bet-type badges — why: mirrors BetForm locked-slip wording. */
function PickRow({ bet, isCurrentUser }: PickRowProps) {
  return (
    <li
      className={cn(
        "rounded-lg px-2 py-1.5 text-sm",
        isCurrentUser && "bg-accent/10 ring-1 ring-accent/30",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("font-medium text-foreground", isCurrentUser && "text-accent")}>
          {bet.displayName}
          {isCurrentUser ? (
            <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>
          ) : null}
        </span>
        <span className="flex flex-wrap gap-1">
          {bet.betType === "double_down" ? (
            <Badge variant="warning" className="text-[10px]">
              2x
            </Badge>
          ) : null}
          {bet.hasPalated ? (
            <Badge variant="accent" className="text-[10px]">
              Palat
            </Badge>
          ) : null}
        </span>
      </div>
    </li>
  );
}

/**
 * Lists group members' picks for this match in two team columns after lock,
 * or only an aggregate count before lock.
 */
export function GroupBets({
  currentUserId,
  team1,
  team2,
  isBettingLocked,
  totalGroupMembers,
  bets,
  className,
}: GroupBetsProps) {
  const betsPlacedCount = bets.length;

  const team1Bets = bets.filter((b) => b.selectedTeamId === team1.id).sort(sortByDisplayName);
  const team2Bets = bets.filter((b) => b.selectedTeamId === team2.id).sort(sortByDisplayName);

  return (
    <Card className={cn(className)}>
      <CardHeader
        title="Group picks"
        description={
          isBettingLocked
            ? "Everyone's locked picks for this match."
            : "Picks stay hidden until betting closes."
        }
      />

      {!isBettingLocked ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">
            {betsPlacedCount}/{totalGroupMembers}
          </span>{" "}
          {betsPlacedCount === 1 ? "player has" : "players have"} placed a bet
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 border-t border-border/60 pt-4">
          <div>
            <h4 className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {team1.shortName}
            </h4>
            {team1Bets.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground">No picks</p>
            ) : (
              <ul className="space-y-1">
                {team1Bets.map((bet) => (
                  <PickRow key={bet.userId} bet={bet} isCurrentUser={bet.userId === currentUserId} />
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {team2.shortName}
            </h4>
            {team2Bets.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground">No picks</p>
            ) : (
              <ul className="space-y-1">
                {team2Bets.map((bet) => (
                  <PickRow key={bet.userId} bet={bet} isCurrentUser={bet.userId === currentUserId} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
