# AGENTS.md

This file defines coding standards and conventions for AI agents working in this codebase. Follow these rules for every code change, regardless of how small.

---

## Stack

- **Framework**: Next.js 16.2.3 — App Router, `src/app/` directory structure
- **UI**: React 19.2.4 — Server Components by default
- **Language**: TypeScript 5.x — strict mode enabled
- **Styling**: Tailwind CSS v4 via PostCSS — no `tailwind.config` file
- **Fonts**: Geist (sans) and Geist Mono via `next/font/google`
- **Database**: PostgreSQL via Prisma 7.7.0
- **Prisma client**: generated at `src/generated/prisma/` — import from there, not `@prisma/client`
- **Linting**: ESLint 9.x with `eslint-config-next` (core-web-vitals + TypeScript)

---

## General principles

- Write simple, readable code over clever code.
- Comments explain *why*, not *what*. The code explains what.
- Never commit `console.log`, `debugger`, or commented-out dead code.
- Do not add new dependencies unless explicitly asked. Prefer what is already installed.
- Keep functions small and single-purpose. If a function is doing two things, split it.

---

## TypeScript

- All files must be `.ts` or `.tsx`. No `.js` or `.jsx`.
- Strict mode is on — respect it. No `// @ts-ignore` or `// @ts-expect-error` without a documented reason.
- Avoid `any`. Use `unknown` with type narrowing when the shape is genuinely unknown.
- Use `interface` for object shapes and component props. Use `type` for unions, intersections, and aliases.
- Prefer `satisfies` over `as` for type assertions.
- Always type function return values explicitly for exported functions.

```ts
// Good
interface BetCardProps {
  bet: Bet;
  className?: string;
}

export function formatOdds(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

// Avoid
const result = someValue as any;
```

---

## React & Next.js (App Router)

### Server vs. client components

- **Default to server components.** Only add `"use client"` when you need:
  - Browser APIs (`window`, `localStorage`, etc.)
  - Event handlers (`onClick`, `onChange`, etc.)
  - React state (`useState`, `useReducer`) or effects (`useEffect`)
- Never import a client component into a server component without understanding the boundary. Pass server data down as props.
- Mark the boundary as high up the tree as possible so the server component tree stays large.

### Data fetching

- Fetch data directly in server components using `async/await`. Do not use `useEffect` for data fetching.
- Use Next.js caching primitives (`cache()`, `revalidatePath()`, `revalidateTag()`) for cache control. Do not reach for `no-store` globally.
- Always handle loading and error states. Use `loading.tsx` and `error.tsx` within route segments.

```tsx
// Good — server component data fetch
export default async function LeaguePage({ params }: { params: { id: string } }) {
  const league = await getLeague(params.id);
  return <LeagueDetail league={league} />;
}
```

### Component conventions

- One component per file. File name is kebab-case; export name is PascalCase.
- Keep components under ~150 lines. Split into sub-components when they grow beyond that.
- `className` is always the last prop. Accept and forward it using the `cn()` helper.
- Do not use inline `style={{}}` for layout or visual styling — use Tailwind classes.

```tsx
// Standard component shape
import { cn } from "@/lib/utils";
import type { Match } from "@/generated/prisma";

interface MatchCardProps {
  match: Match;
  className?: string;
}

export function MatchCard({ match, className }: MatchCardProps) {
  return (
    <div className={cn("rounded-lg border p-4", className)}>
      <p className="text-sm font-medium">{match.homeTeam} vs {match.awayTeam}</p>
    </div>
  );
}
```

---

## Tailwind CSS v4

This project uses **Tailwind CSS v4**. The v4 conventions differ meaningfully from v3 — follow them precisely.

- **No `tailwind.config.js` or `tailwind.config.ts`** — v4 does not use one. Do not create it.
- Configuration and theme tokens live in your CSS entry point (e.g., `src/app/globals.css`) using the `@theme` directive.
- Custom design tokens are defined as CSS custom properties inside `@theme {}`, not inside a JS config object.

```css
/* globals.css — defining custom tokens the v4 way */
@import "tailwindcss";

@theme {
  --color-brand: oklch(55% 0.2 250);
  --font-sans: "Geist", sans-serif;
  --font-mono: "Geist Mono", monospace;
}
```

- **Use Tailwind utility classes exclusively** for styling. Do not write custom CSS unless Tailwind cannot express it.
- **No arbitrary values** (e.g., `w-[347px]`) unless the value comes from a design token or you document why.
- Use the `cn()` helper (`clsx` + `tailwind-merge`) to compose conditional class strings:

```tsx
import { cn } from "@/lib/utils";

<button
  className={cn(
    "rounded-md px-4 py-2 text-sm font-medium",
    isPrimary ? "bg-brand text-white" : "bg-muted text-foreground",
    className
  )}
/>
```

- Responsive layout changes use Tailwind prefixes (`sm:`, `md:`, `lg:`). Never write media queries in JS.
- Dark mode via the `dark:` prefix only. No JS-based theme switching logic.

### Fonts

Geist and Geist Mono are loaded via `next/font/google` and applied as CSS variables. Reference them through Tailwind's `font-sans` and `font-mono` utilities (mapped in `@theme`), not via hardcoded `font-family` CSS.

---

## Prisma & database

### Client import

The Prisma client is generated at `src/generated/prisma/`. **Always import from there**, not from `@prisma/client`.

```ts
// Correct
import { PrismaClient } from "@/generated/prisma";

// Wrong — do not use
import { PrismaClient } from "@prisma/client";
```

### Singleton client

Instantiate a single Prisma client and reuse it across the app. Do not create `new PrismaClient()` inside route handlers or components.

```ts
// src/lib/prisma.ts
import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### Query conventions

- All database calls go in `src/lib/` or `src/server/` — not in components or route handlers directly.
- Use Prisma's `select` to fetch only the fields you need. Never return full records when a subset suffices.
- Always handle `null` from `findUnique` / `findFirst` — do not assume a record exists.
- Wrap multi-step writes in a `prisma.$transaction()`.
- Never expose raw Prisma model types to client components. Map to a plain DTO type at the server/client boundary.

```ts
// src/lib/leagues.ts
import { prisma } from "@/lib/prisma";

export async function getLeague(id: string) {
  const league = await prisma.league.findUnique({
    where: { id },
    select: { id: true, name: true, season: true },
  });
  if (!league) return null;
  return league;
}
```

### Schema & migrations

- Domain tables in `prisma/schema.prisma`: `users`, `leagues`, `teams`, `matches`, `bets`, and related tables.
- Never edit the database directly. All schema changes go through `prisma migrate dev`.
- After changing `schema.prisma`, regenerate the client: `npx prisma generate`.
- Migration files in `prisma/migrations/` are committed and must not be edited after being applied.

---

## File & folder structure

```
src/
  app/                    # Next.js App Router — pages, layouts, loading, error
    (routes)/
      layout.tsx
      page.tsx
      loading.tsx
      error.tsx
  components/
    ui/                   # Primitive, reusable UI components
    [feature]/            # Feature-scoped components (bets/, leagues/, matches/)
  hooks/                  # Custom React hooks — use-*.ts naming
  lib/                    # Utilities, helpers, Prisma singleton, server actions
    actions/              # Server actions ("use server")
    prisma.ts             # Prisma singleton
    utils.ts              # cn() and other general helpers
  generated/
    prisma/               # Auto-generated Prisma client — do not edit manually
  types/                  # Shared TypeScript types and DTOs
```

- One component per file. `BetSlip` lives in `bet-slip.tsx`.
- Barrel `index.ts` files are fine for multi-export folders, but avoid them if they create circular dependencies.
- Hooks live in `src/hooks/` and are named `use-[name].ts`.
- Server-only code (Prisma queries, sensitive logic) goes in `src/lib/` and must never be imported by client components. Add `import "server-only"` at the top of these files to enforce the boundary.

---

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Components | PascalCase | `BetSlip`, `MatchCard` |
| Files | kebab-case | `bet-slip.tsx`, `match-card.tsx` |
| Hooks | camelCase with `use` prefix | `useBetHistory`, `useLeagueStandings` |
| Server actions | camelCase verb phrase | `placeBet`, `updateMatchScore` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_BET_AMOUNT` |
| Types / interfaces | PascalCase | `MatchResult`, `BetPayload` |
| Event handlers | `handle` prefix | `handleSubmit`, `handleOddsChange` |
| Boolean props/vars | `is` / `has` / `can` prefix | `isLoading`, `hasSettled`, `canBet` |
| Prisma DTO types | Suffix with `DTO` | `LeagueDTO`, `BetDTO` |

---

## Server actions

- Define server actions in `src/lib/actions/` with `"use server"` at the top of the file.
- Validate all input with Zod before touching the database.
- Return a typed result object — never throw raw errors to the client.

```ts
"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";

const PlaceBetSchema = z.object({
  matchId: z.string().cuid(),
  amount: z.number().positive().max(10_000),
  selection: z.enum(["home", "draw", "away"]),
});

export async function placeBet(input: unknown) {
  const parsed = PlaceBetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const bet = await prisma.bet.create({ data: { ...parsed.data } });
  return { data: bet };
}
```

---

## Accessibility

- Use semantic HTML. Reach for `<button>`, `<a>`, `<input>`, `<select>` before `<div onClick>`.
- Every image needs a meaningful `alt`. Use `alt=""` for purely decorative images.
- Icon-only buttons need `aria-label`.
- Maintain a logical heading hierarchy — do not skip levels.
- Ensure sufficient colour contrast on all text, especially over brand colours.

---

## Error handling

- Never swallow errors silently.
- Use `error.tsx` boundaries for route-level errors. Use `notFound()` from `next/navigation` for missing records.
- Validate all external data (API responses, form inputs, server action args) with Zod at the boundary.
- Server actions return typed result objects (`{ data } | { error }`). Raw Prisma errors must never bubble to the client.

---

## ESLint

- ESLint 9.x is configured with `eslint-config-next` (core-web-vitals + TypeScript). Respect all rules.
- Do not disable lint rules inline without a comment explaining why.
- Run `npx eslint .` before considering any change done. Fix all errors; treat warnings as errors in new code.

---

## What to avoid

- `useEffect` for data fetching — use server components or React Query / SWR only if client-side polling is genuinely needed.
- Importing from `@prisma/client` — always use `@/generated/prisma`.
- Creating `new PrismaClient()` outside the singleton in `src/lib/prisma.ts`.
- Hardcoded colours, spacing, or type sizes — use Tailwind utility classes and `@theme` tokens.
- Creating a `tailwind.config.js` — this is Tailwind v4; config lives in CSS.
- Prop drilling more than 2 levels deep — use Context or co-location.
- Default exports for anything that is not a Next.js page or layout file — use named exports.
- Raw Prisma model types crossing the server/client boundary — map to a DTO first.
- Arbitrary values in Tailwind classes unless a design token or documented reason exists.

---

## Commit hygiene

- One concern per commit. Do not mix feature work with refactors or migrations.
- Use conventional commit prefixes: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `db:` (for schema and migrations).
- Never commit `.env`, secrets, or generated files outside of `src/generated/prisma/` (which is committed as project-owned output).