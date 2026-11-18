"""Same-index ETF switching backtest (long-only, daily, not intraday).

    .venv/bin/python -m backtest.etf_switch
    .venv/bin/python -m backtest.etf_switch --initial 1000000 --monthly-deposit 0

Two ETFs tracking the same index (A = the liquid default, B = the alternative).
Relative price gap: d = log(A/B) minus its rolling mean over `window` sessions (the rolling mean
absorbs slow drift from different expense ratios / NAV per unit). d > 0 means A is rich vs B.

Strategies (decided after the close, executed at the next session's open with slippage):
- hold A:          buy A with every rupee, never sell. Baseline.
- switch:          hold one ETF. Holding A and d > +threshold -> sell all A, buy B.
                   Holding B and d < -threshold -> sell all B, buy A. Every switch pays
                   charges and realizes capital gains (taxed per financial year).
- deposit routing: never sell; each deposit buys whichever ETF is cheaper (sign of d).

Final value = liquidation value after tax: everything is sold at the last close and the tax for
that year is paid, so strategies that defer tax are compared fairly.
Charges and tax rules come from backtest/costs.json (see costs.py).
"""

import argparse
import math
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_FLOOR, Decimal

from backtest import data
from backtest.costs import CostModel, TaxBook, financial_year
from src.models import money, price


@dataclass
class Outcome:
    name: str
    switches: int = 0
    charges: Decimal = Decimal(0)
    tax: Decimal = Decimal(0)
    flows: list[tuple[date, Decimal]] = field(default_factory=list)  # deposits (negative)
    final: Decimal = Decimal(0)
    end: date | None = None
    share_in_b: float = 0.0


def _floor(x: Decimal) -> int:
    return max(int(x.to_integral_value(ROUND_FLOOR)), 0)


def deviations(days, a_close, b_close, window: int) -> list[float | None]:
    logs = [math.log(a / b) for a, b in zip(a_close, b_close, strict=True)]
    out: list[float | None] = []
    running = 0.0
    for i, v in enumerate(logs):
        running += v
        if i >= window:
            running -= logs[i - window]
        out.append(v - running / window if i >= window - 1 else None)
    return out


def simulate(name, mode, ta, tb, days, bars, dev, threshold, initial, monthly, slip, costs):
    book = TaxBook(costs)
    out = Outcome(name)
    cash = money(initial)
    held = {ta: 0, tb: 0}
    fy = financial_year(days[0])
    pending: list[tuple[str, str]] = []  # (side, ticker); BUY uses all available cash
    current = ta
    days_in_b = 0
    out.flows.append((days[0], -cash))

    def sell_all(day, t, px_raw):
        nonlocal cash
        qty = held[t]
        if qty == 0:
            return
        px = price(px_raw * (1 - slip))
        value = money(qty * px)
        tc = costs.trade_cost(t, "SELL", value)
        dp = costs.dp_charge()
        cash += value - tc.total - dp
        out.charges += tc.total + dp
        book.sell(t, day, qty, value - (tc.total - tc.stt) - dp)
        held[t] = 0

    def buy_max(day, t, px_raw):
        nonlocal cash
        px = price(px_raw * (1 + slip))
        qty = _floor(cash / (px * (1 + costs.buy_cost_factor(t))))
        if qty == 0:
            return
        value = money(qty * px)
        tc = costs.trade_cost(t, "BUY", value)
        cash -= value + tc.total
        out.charges += tc.total
        book.buy(t, day, qty, value + tc.total - tc.stt)
        held[t] += qty

    for i, day in enumerate(days):
        if financial_year(day) != fy:
            tax = book.close_year(fy)
            cash -= tax
            out.tax += tax
            fy = financial_year(day)

        for side, t in pending:
            if side == "SELL":
                sell_all(day, t, bars[t][day].open)
            else:
                buy_max(day, t, bars[t][day].open)
        pending = []

        if i > 0 and day.month != days[i - 1].month and monthly > 0:
            cash += monthly
            out.flows.append((day, -monthly))

        days_in_b += held[tb] > 0

        if i == len(days) - 1:
            break

        d = dev[i]
        if mode == "hold":
            if cash > 0:
                pending = [("BUY", ta)]
        elif mode == "route":
            if cash > 0:
                cheaper = tb if (d is not None and d > 0) else ta
                pending = [("BUY", cheaper)]
        else:  # switch
            target = current
            if d is not None:
                if current == ta and d > threshold:
                    target = tb
                elif current == tb and d < -threshold:
                    target = ta
            if target != current:
                out.switches += 1
                pending = [("SELL", current), ("BUY", target)]
                current = target
            elif cash > 0:
                pending = [("BUY", current)]

    # Liquidate at the last close and pay the final year's tax.
    last = days[-1]
    for t in (ta, tb):
        sell_all(last, t, bars[t][last].close / (1 - slip))  # at close, no extra slippage
    tax = book.close_year(fy)
    cash -= tax
    out.tax += tax
    out.final = cash
    out.end = last
    out.share_in_b = days_in_b / len(days)
    return out


def xirr(flows: list[tuple[date, Decimal]], end: date, final: Decimal) -> float:
    start = flows[0][0]
    pts = [((d - start).days / 365.25, float(a)) for d, a in flows]
    pts.append(((end - start).days / 365.25, float(final)))

    def npv(r):
        return sum(a / (1 + r) ** t for t, a in pts)

    lo, hi = -0.99, 10.0
    if npv(lo) * npv(hi) > 0:
        return float("nan")
    for _ in range(200):
        mid = (lo + hi) / 2
        if npv(lo) * npv(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def table(headers, rows):
    cells = [headers] + [[str(c) for c in r] for r in rows]
    widths = [max(len(r[i]) for r in cells) for i in range(len(headers))]
    for n, row in enumerate(cells):
        print("  ".join(c.ljust(widths[i]) for i, c in enumerate(row)))
        if n == 0:
            print("  ".join("-" * w for w in widths))


def main():
    ap = argparse.ArgumentParser(description="Same-index ETF switching backtest")
    ap.add_argument("--pairs", default="NIFTYBEES.NS/NIFTY1.NS,GOLDBEES.NS/GOLD1.NS")
    ap.add_argument("--from", dest="start", default="2010-01-01")
    ap.add_argument("--to", dest="end", default=date.today().isoformat())
    ap.add_argument("--initial", default="5000")
    ap.add_argument("--monthly-deposit", default="5000")
    ap.add_argument("--slippage-pct", default="0.05")
    ap.add_argument("--thresholds", default="0.25,0.5,1.0", help="switch thresholds, percent")
    ap.add_argument("--windows", default="20,60", help="rolling-mean windows, sessions")
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    costs = CostModel()
    initial, monthly = Decimal(args.initial), Decimal(args.monthly_deposit)
    slip = Decimal(args.slippage_pct) / 100
    start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)

    for pair in args.pairs.split(","):
        ta, tb = pair.strip().split("/")
        costs.check([ta, tb])
        bars = {t: {b.day: b for b in data.load(t, args.refresh)} for t in (ta, tb)}
        days = sorted(d for d in set(bars[ta]) & set(bars[tb]) if start <= d <= end)
        a_close = [float(bars[ta][d].close) for d in days]
        b_close = [float(bars[tb][d].close) for d in days]

        logs = [math.log(a / b) for a, b in zip(a_close, b_close, strict=True)]
        diffs = sorted(abs(logs[i] - logs[i - 1]) * 100 for i in range(1, len(logs)))
        print(f"\n################ {ta} vs {tb}: {days[0]} → {days[-1]} ({len(days)} sessions)")
        print(
            f"Initial INR {initial}, monthly INR {monthly}, slippage {args.slippage_pct}%, "
            f"charges + tax on"
        )
        print(
            f"Daily change in the A/B price ratio: median {diffs[len(diffs) // 2]:.2f}%, "
            f"90th pct {diffs[int(len(diffs) * 0.9)]:.2f}%, 99th pct "
            f"{diffs[int(len(diffs) * 0.99)]:.2f}%"
        )

        results = [
            simulate(
                f"hold {ta}",
                "hold",
                ta,
                tb,
                days,
                bars,
                [None] * len(days),
                0,
                initial,
                monthly,
                slip,
                costs,
            )
        ]
        for w in (int(x) for x in args.windows.split(",")):
            dev = deviations(days, a_close, b_close, w)
            results.append(
                simulate(
                    f"route deposits W={w}",
                    "route",
                    ta,
                    tb,
                    days,
                    bars,
                    dev,
                    0,
                    initial,
                    monthly,
                    slip,
                    costs,
                )
            )
            for th in (float(x) for x in args.thresholds.split(",")):
                results.append(
                    simulate(
                        f"switch W={w} gap>{th}%",
                        "switch",
                        ta,
                        tb,
                        days,
                        bars,
                        dev,
                        th / 100,
                        initial,
                        monthly,
                        slip,
                        costs,
                    )
                )

        base = xirr(results[0].flows, results[0].end, results[0].final)
        rows = []
        for r in results:
            x = xirr(r.flows, r.end, r.final)
            invested = -sum(a for _, a in r.flows)
            rows.append(
                [
                    r.name,
                    f"{x * 100:.2f}",
                    f"{(x - base) * 100:+.2f}",
                    r.switches,
                    f"{r.share_in_b * 100:.0f}",
                    f"{r.charges:,.0f}",
                    f"{r.tax:,.0f}",
                    f"{invested:,.0f}",
                    f"{r.final:,.0f}",
                ]
            )
        table(
            [
                "Strategy",
                "XIRR % (after tax)",
                "vs hold",
                "Switches",
                f"% days in {tb}",
                "Charges",
                "Tax",
                "Invested",
                "Final after tax",
            ],
            rows,
        )


if __name__ == "__main__":
    main()
