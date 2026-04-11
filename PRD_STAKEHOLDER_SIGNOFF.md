# IPL FanBet PRD — Stakeholder Sign-Off

**PRD reference:** `ipl_fanbet_prd_5ab41542.plan.md` (v1.0, April 11, 2026)  
**Purpose:** Record product review and **binding decisions** on Section 15 open questions before build. Do not treat implementation as locked until this document is signed.

---

## 1. PRD acknowledgment

Stakeholders confirm they have read the PRD and accept the documented scope for v1 (invite-only leagues, betting rules, Palat, Double Down, streak bonuses, leaderboard, prize pool tracking, admin flows, and NFRs).

| Role            | Name | Date | Signature / approval |
| --------------- | ---- | ---- | --------------------- |
| Product owner   |      |      |                       |
| Tech lead       |      |      |                       |
| League ops / admin (pilot) |      |      |                       |

---

## 2. Section 15 — Open questions (decisions required)

The PRD lists four items for explicit stakeholder agreement. **Recommended defaults** are provided to speed review; replace any row with your chosen option before sign-off.

### Q1 — Double Down: penalty on wrong pick?

**Question (§15.1):** Should incorrect Double Down bets carry **negative** points, or stay at **0** as in the current PRD?

| Option | Description |
| ------ | ----------- |
| **A (recommended)** | **0 points** on loss (matches §6.4 and points table — no negative penalty). Keeps the game friendly and avoids disputes. |
| B | Negative points on loss (specify amount, e.g. −2 or −4). |

**Stakeholder decision:** ☐ A ☐ B — If B, specify: _______________

**Rationale for A:** Aligns with existing §6.4 text and “zero scoring disputes” success metric; simplest to explain in `/rules`.

---

### Q2 — Multiple concurrent leagues per user (same season)?

**Question (§15.2):** Can one user join **more than one** private league for IPL 2026 at the same time?

| Option | Description |
| ------ | ----------- |
| **A (recommended)** | **Yes** — same account can hold memberships in multiple leagues (PRD §3 already allows Admin in one league and Player in another). |
| B | No — one league per user per season (simpler UX and data model). |

**Stakeholder decision:** ☐ A ☐ B

**Rationale for A:** Matches multi-league social use (office league + friend league); requires `LeagueMembership` scoped by `leagueId` everywhere (already implied by the data model).

---

### Q3 — Playoff Palat: one use across playoffs vs per match?

**Question (§15.3):** §6.3 states playoff stage: max **1** Palat per player per league. Clarify scope.

| Option | Description |
| ------ | ----------- |
| **A (recommended)** | **One Palat total** for the entire playoff phase (all Q/Eliminator/Final matches combined). Matches a strict reading of “per league” for the stage. |
| B | **One Palat per playoff match** (user could use Palat on several playoff games, up to one each). |

**Stakeholder decision:** ☐ A ☐ B

**Rationale for A:** Maximizes scarcity and drama; easier to show as “Playoff Palat: 0/1 used” in UI.

---

### Q4 — Missed bet: streak behavior?

**Question (§15.4):** Should a **missed** bet (no pick before deadline) reset the win streak, or be treated like an **abandoned** match (streak unchanged)?

| Option | Description |
| ------ | ----------- |
| **A (recommended)** | **Missed bet resets streak** — consistent with §6.2 (“their win streak resets”). |
| B | Missed bet does not count for streak (like abandoned) — more forgiving. |

**Stakeholder decision:** ☐ A ☐ B

**Rationale for A:** Matches explicit §6.2 copy; Option B would require PRD edits and different leaderboard/streak logic.

---

## 3. Sign-off — Section 15 decisions locked

By signing below, stakeholders confirm the **selected options** in §2 (including any handwritten overrides) are approved for implementation.

| Name | Role | Date |
| ---- | ---- | ---- |
|      |      |      |
|      |      |      |

---

## 4. Completion checklist (for PM / agent tracking)

- [ ] All §2 questions have a checked option or written override.
- [ ] Table in §1 filled or explicitly waived for pilot-only build.
- [ ] Product owner (or delegate) signed §3.

**Status:** ☐ Ready for implementation (sign-off complete) ☐ Blocked — pending items: _______________
