# PRD: Live Match Time-Windowed Parimutuel Betting Platform

**Version:** 0.1 (Draft)
**Status:** In Review
**Owner:** Product Team

---

## 1. Overview

A live sports betting platform that divides a cricket match (or any live sport) into discrete time windows of 5–10 minutes each. Within every window, users stake money on either Team A or Team B. At the end of the match, winners in each window share the losers' pool, weighted by how early they placed their bets.

---

## 2. Problem Statement

Traditional pre-match betting locks users into a single decision made before any match context exists. Existing live betting platforms use fixed-odds bookmakers who carry risk and often manipulate odds. There is no product that combines:

- **Continuous engagement** throughout a live match
- **Peer-to-peer pool betting** (no bookmaker risk)
- **Fairness to early risk-takers** who bet with less information

---

## 3. Goals

- Enable users to bet on any or all time windows throughout a live match
- Operate as a pure parimutuel pool
- Reward early bettors via time-weighted payout mechanics
- Maintain transparency and auditability of all pool calculations

---

## 4. Non-Goals

- No fixed-odds or bookmaker-style betting
- No pre-match single-bet product (separate scope)
- No trading or bet withdrawal after placement

---

## 5. Core Concepts

### 5.1 Time Windows

Each match is divided into sequential windows of configurable duration (default: 5–10 minutes or every 2 overs in cricket). Windows open and close on a fixed schedule announced before match start.

| State | Description |
|---|---|
| **Open** | Bets are accepted for this window |
| **Closed** | No new bets; window awaits match outcome |
| **Settled** | Payouts calculated and distributed |
| **Void** | Window cancelled (e.g. rain interruption); all bets refunded |

### 5.2 Pool Mechanics

Each window maintains two independent pools: one for Team A and one for Team B. The total pool for a window is:

```
Total Pool = Team A Pool + Team B Pool
Distributable Pool = Total Pool × (1 - House Takeout %)
```

The losing side's stake goes into the distributable pool. Winners receive a share proportional to their **time-weighted contribution**.

### 5.3 Time-Weighted Payout

To prevent late-window information arbitrage, each bet is assigned a weight based on when it was placed within the window:

```
Weight = Amount × (T - t) / T
```

Where:
- `T` = total window duration in seconds
- `t` = seconds elapsed since window opened when bet was placed
- `Amount` = bet amount in currency

A bettor's share of the distributable pool is:

```
Individual Share = (Bettor's Weight / Total Winning-Side Weight) × Distributable Pool
```

**Example** (T = 600s, Team A wins, Distributable Pool = ₹14,400):

| Bettor | Amount | Time (t) | Weight | Payout |
|---|---|---|---|---|
| Alice | ₹1,000 | t = 0s | 1000.0 | ₹1,647 |
| Bob | ₹1,000 | t = 300s | 500.0 | ₹824 |
| Carol | ₹1,000 | t = 590s | 17.0 | ₹28 |

Losers forfeit their entire stake regardless of timing.

---

## 6. Window Resolution

### 6.1 Resolution Criteria

Each window resolves based on a **pre-declared rule** shown to users before the match. For cricket, supported resolution types:

- **Match winner** — the team that wins the overall match (same outcome applied to all windows)
- **Over-period winner** — the team with more runs in that specific window's overs
- **Custom event** — wicket fall, powerplay outcome, etc. (future scope)

> For the MVP, all windows in a match share the same resolution event: the **match winner**.

### 6.2 Settlement Trigger

Settlement is triggered automatically once the match result is confirmed via the integrated data feed. No manual intervention required under normal conditions.

---

## 7. User Flow

```
1. User opens app → sees live match with active/upcoming windows
2. User selects a window → sees current pool sizes, time remaining, live weight multiplier
3. User picks Team A or Team B → enters stake amount
4. App shows estimated payout range (based on current pool snapshot)
5. User confirms → bet is locked with timestamp
6. Window closes → pool frozen, awaiting match result
7. Match concludes → settlement runs automatically
8. User notified of win/loss → wallet updated
```

---

## 8. Key UX Requirements

- **Live weight multiplier indicator** — show users their current time-weight multiplier in real time as they prepare to place a bet (e.g. "Bet now → 0.73× weight")
- **Pool size display** — show Team A vs Team B pool sizes for each window to help users gauge odds
- **Window countdown timer** — prominent timer showing seconds remaining in open window
- **Estimated payout** — calculated from current pool snapshot; clearly labelled as an estimate since pool changes until window closes
- **Window history** — users can see past settled windows and their outcomes in a match timeline view

---

## 9. Platform & House Economics

- **House Takeout:** Configurable per market (default: 10–15% of total pool per window)
- **Revenue = sum of takeouts across all windows across all matches**
- Platform carries no betting risk; it only facilitates the pool

---

## 10. Edge Cases & Policies

| Scenario | Handling |
|---|---|
| Match abandoned mid-way | All unsettled open/closed windows voided; bets refunded |
| DLS method applied | Windows unaffected if match result still declared; void if result inconclusive |
| Only one side of pool has bets | Window voided; all bets on that window refunded |
| Network failure during bet placement | Bet only valid if server acknowledgement received before window close |
| Disputed match result | Manual review; settlement paused until official result confirmed |

---

## 11. Out of Scope (MVP)

- Bet withdrawal or editing after placement
- In-window odds display (dynamic implied probability)
- Multi-sport support (cricket only for MVP)
- Social/group pools
- Fiat on-ramp/off-ramp (assumes wallet pre-funded)

---

## 12. Success Metrics

| Metric | Target (3 months post-launch) |
|---|---|
| Bets per user per match | ≥ 4 windows engaged |
| Average window pool size | ₹50,000+ |
| Settlement accuracy | 100% (zero manual corrections) |
| Early-window bet share | ≥ 40% of bets placed in first half of window |
| User retention (match 2+) | ≥ 60% of users who bet on match 1 |

---

## 13. Open Questions

1. Should window duration be fixed across a match or configurable per innings/phase?
2. What data provider will be used for match result feeds and latency SLA?
3. What is the regulatory classification of this product in target markets (India, UAE, etc.)?
4. Should users be able to bet on multiple windows simultaneously or sequentially only?

---

*Last updated: February 2026*