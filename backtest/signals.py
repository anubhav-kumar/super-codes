"""Moving-average crossover signals and dynamic target weights (backtest only).

Signals per ticker, from its own full daily history (split/dividend-adjusted closes):
- GOLDEN (+1): fast SMA crosses above slow SMA.
- DEATH  (-1): fast SMA crosses below slow SMA.

Weight policies:
- "fixed":      weights never change.
- "contrarian": GOLDEN cuts the ticker's weight by `step`, DEATH raises it by `step`.
- "trend":      GOLDEN raises the ticker's weight by `step`, DEATH cuts it by `step`.

Points moved are taken from / given to the other tickers in proportion to their current
weights. CASH never changes. Each ticker stays within [0, max_weight]; a change that would
break a limit is reduced to fit (or skipped if nothing can move).
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from backtest.data import DailyBar
from src.models import CASH

GOLDEN = 1
DEATH = -1
PLACES = Decimal("0.0001")


def crossovers(bars: list[DailyBar], fast: int, slow: int) -> dict[date, int]:
    prefix = [Decimal(0)]
    for b in bars:
        prefix.append(prefix[-1] + b.close)

    def sma(end: int, n: int) -> Decimal:  # mean of closes[end-n+1 .. end]
        return (prefix[end + 1] - prefix[end + 1 - n]) / n

    signals: dict[date, int] = {}
    prev_diff = None
    for i in range(slow - 1, len(bars)):
        diff = sma(i, fast) - sma(i, slow)
        if prev_diff is not None:
            if prev_diff <= 0 < diff:
                signals[bars[i].day] = GOLDEN
            elif prev_diff >= 0 > diff:
                signals[bars[i].day] = DEATH
        prev_diff = diff
    return signals


@dataclass
class WeightEvent:
    day: date
    ticker: str
    signal: str
    change: Decimal
    targets: dict[str, Decimal]


class DynamicWeights:
    def __init__(
        self,
        initial: dict[str, Decimal],
        signals: dict[str, dict[date, int]],
        policy: str,
        step: Decimal,
        max_weight: Decimal,
    ) -> None:
        if policy not in ("fixed", "contrarian", "trend"):
            raise ValueError(f"unknown policy {policy!r}")
        self.targets = dict(initial)
        self.signals = signals
        self.policy = policy
        self.step = step
        self.max_weight = max_weight
        self.events: list[WeightEvent] = []

    def update(self, day: date) -> bool:
        """Apply any crossovers on `day`. Returns True if any weight changed."""
        if self.policy == "fixed":
            return False
        changed = False
        for ticker in sorted(t for t in self.targets if t != CASH):
            signal = self.signals.get(ticker, {}).get(day)
            if signal is None:
                continue
            direction = signal if self.policy == "trend" else -signal
            moved = self._shift(ticker, self.step * direction)
            if moved != 0:
                changed = True
                self.events.append(
                    WeightEvent(
                        day,
                        ticker,
                        "GOLDEN" if signal == GOLDEN else "DEATH",
                        moved,
                        dict(self.targets),
                    )
                )
        return changed

    def _shift(self, ticker: str, delta: Decimal) -> Decimal:
        """Move up to |delta| points into/out of `ticker`. Returns the signed amount moved."""
        others = [t for t in self.targets if t not in (CASH, ticker)]
        w = self.targets
        if delta < 0:
            amount = min(-delta, w[ticker])
            given = self._give(others, amount)
            w[ticker] -= given
            return -given
        amount = min(delta, self.max_weight - w[ticker])
        taken = self._take(others, amount)
        w[ticker] += taken
        return taken

    def _give(self, others: list[str], amount: Decimal) -> Decimal:
        """Add up to `amount` to `others` in proportion to their weights, never above the cap.
        Returns what was actually added."""
        w = self.targets
        given_total = Decimal(0)
        open_ = [t for t in others if w[t] < self.max_weight]
        while amount - given_total >= PLACES and open_:
            remaining = amount - given_total
            base = sum((w[t] for t in open_), Decimal(0))
            given = Decimal(0)
            for t in open_:
                share = w[t] / base if base > 0 else Decimal(1) / len(open_)
                add = min((remaining * share).quantize(PLACES), self.max_weight - w[t])
                w[t] += add
                given += add
            given_total += given
            open_ = [t for t in open_ if w[t] < self.max_weight]
            if given == 0:
                break
        return given_total

    def _take(self, others: list[str], amount: Decimal) -> Decimal:
        """Remove up to `amount` from `others` in proportion to their weights (never below 0).
        Returns what was actually removed."""
        w = self.targets
        pool = sum((w[t] for t in others), Decimal(0))
        amount = min(amount, pool)
        if amount <= 0:
            return Decimal(0)
        taken = Decimal(0)
        for t in others:
            cut = min((amount * w[t] / pool).quantize(PLACES), w[t])
            w[t] -= cut
            taken += cut
        return taken
