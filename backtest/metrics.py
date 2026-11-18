"""Performance metrics on a simulated equity curve.

Returns are time-weighted: each day's deposit is removed before computing that day's return,
so monthly deposits do not inflate CAGR.
"""

import math
import statistics
from dataclasses import dataclass

from backtest.simulator import SimResult

TRADING_DAYS = 252


@dataclass
class Metrics:
    name: str
    start: str
    end: str
    years: float
    invested: float
    final_value: float
    total_return_pct: float
    cagr_pct: float
    xirr_pct: float
    xirr_liq_pct: float
    liquidation_value: float
    harvests: int
    max_drawdown_pct: float
    volatility_pct: float
    rebalances: int
    trades: int
    charges: float
    taxes: float


def compute(result: SimResult, initial_cash: float) -> Metrics:
    curve = result.curve
    daily = []
    for prev, cur in zip(curve, curve[1:], strict=False):
        base = float(prev.value)
        if base > 0:
            daily.append((float(cur.value) - float(cur.deposit)) / base - 1)

    growth = 1.0
    peak = 1.0
    max_dd = 0.0
    for r in daily:
        growth *= 1 + r
        peak = max(peak, growth)
        max_dd = min(max_dd, growth / peak - 1)

    days = (curve[-1].day - curve[0].day).days
    years = days / 365.25 if days else 0.0
    cagr = growth ** (1 / years) - 1 if years > 0 else 0.0
    vol = statistics.stdev(daily) * math.sqrt(TRADING_DAYS) if len(daily) > 1 else 0.0
    invested = initial_cash + sum(float(p.deposit) for p in curve)

    return Metrics(
        name=result.name,
        start=curve[0].day.isoformat(),
        end=curve[-1].day.isoformat(),
        years=round(years, 2),
        invested=round(invested, 2),
        final_value=float(curve[-1].value),
        total_return_pct=round((growth - 1) * 100, 2),
        cagr_pct=round(cagr * 100, 2),
        xirr_pct=round(_xirr(curve, initial_cash) * 100, 2),
        xirr_liq_pct=round(_xirr(curve, initial_cash, float(result.liquidation_value)) * 100, 2),
        liquidation_value=float(result.liquidation_value),
        harvests=result.harvests,
        max_drawdown_pct=round(max_dd * 100, 2),
        volatility_pct=round(vol * 100, 2),
        rebalances=result.rebalances,
        trades=len(result.trades),
        charges=float(result.charges),
        taxes=float(result.taxes),
    )


def _xirr(curve, initial_cash: float, final: float | None = None) -> float:
    """Money-weighted annual return: the rate at which deposits grow into the final value."""
    start = curve[0].day
    flows = [(0.0, -initial_cash)]
    flows += [((p.day - start).days / 365.25, -float(p.deposit)) for p in curve if p.deposit > 0]
    end_value = float(curve[-1].value) if final is None else final
    flows.append(((curve[-1].day - start).days / 365.25, end_value))

    def npv(rate: float) -> float:
        return sum(amount / (1 + rate) ** t for t, amount in flows)

    low, high = -0.99, 10.0
    if npv(low) * npv(high) > 0:
        return float("nan")
    for _ in range(200):
        mid = (low + high) / 2
        if npv(low) * npv(mid) <= 0:
            high = mid
        else:
            low = mid
    return (low + high) / 2
