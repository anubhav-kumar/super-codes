"""Daily (not intraday) pairs-trading backtest: long one leg, short the other, via futures.

    .venv/bin/python -m backtest.pairs
    .venv/bin/python -m backtest.pairs --pairs HDFCBANK.NS/ICICIBANK.NS --split 2019-01-01

Model
- Prices: daily, split-adjusted but NOT dividend-adjusted (stock futures do not receive
  dividends), used as a proxy for continuous futures prices. Futures basis is ignored.
- Hedge ratio: rolling OLS of log(A) on log(B) over `lookback` sessions (past data only).
- Spread: log(A) - beta*log(B) - alpha. z-score vs the spread's last `zwin` sessions.
- Signals after the close; fills at the next session's open with slippage:
    flat and z > +entry  -> short A / long B      flat and z < -entry -> long A / short B
    exit when z crosses back inside +/-exit, stop when |z| > stop, or after max_hold sessions.
- Optional filter: enter only if the Engle-Granger (ADF on the lookback spread) t-stat is below
  the 5% critical value, i.e. the pair is currently cointegrated.
- Sizing: gross notional = capital * gross_leverage, split so value_B = beta * value_A
  (beta-neutral). Fractional units (signal quality test; real futures trade in fixed lots).
- Costs (Zerodha futures, verify before relying): brokerage min(0.03%, INR 20) per order,
  STT 0.02% on sell side, exchange 0.002%, SEBI INR 10/crore, stamp 0.002% on buy side,
  GST 18% on brokerage + exchange + SEBI. Open positions roll monthly (close + reopen both legs).
- Tax: F&O profit is business income; net profit per financial year taxed at slab + cess
  (default 30% + 4%), losses carried forward.
"""

import argparse
import math
from dataclasses import dataclass
from datetime import date

from backtest import data
from backtest.costs import financial_year

EG_CRIT_5PCT = -3.34  # Engle-Granger 2-variable, with constant (MacKinnon), approx.


# ---------------------------------------------------------------- statistics


def ols(x: list[float], y: list[float]) -> tuple[float, float]:
    n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    sxx = sum((xi - mx) ** 2 for xi in x)
    sxy = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y, strict=True))
    beta = sxy / sxx if sxx else 0.0
    return my - beta * mx, beta


def adf_t(series: list[float]) -> tuple[float, float]:
    """Dickey-Fuller regression d(e_t) = a + b*e_(t-1). Returns (t-stat of b, b)."""
    lagged = series[:-1]
    diff = [series[i] - series[i - 1] for i in range(1, len(series))]
    a, b = ols(lagged, diff)
    resid = [d - a - b * x for x, d in zip(lagged, diff, strict=True)]
    n = len(diff)
    s2 = sum(r * r for r in resid) / (n - 2)
    mx = sum(lagged) / n
    sxx = sum((x - mx) ** 2 for x in lagged)
    se = math.sqrt(s2 / sxx) if sxx else float("inf")
    return (b / se if se else 0.0), b


def half_life(b: float) -> float:
    return -math.log(2) / math.log(1 + b) if -1 < b < 0 else float("inf")


# ---------------------------------------------------------------- costs


@dataclass
class Costs:
    slippage: float = 0.0005
    brokerage_pct: float = 0.0003
    brokerage_cap: float = 20.0
    stt_sell: float = 0.0002
    exchange: float = 0.00002
    sebi: float = 10 / 1e7
    stamp_buy: float = 0.00002
    gst: float = 0.18

    def order(self, value: float, side: str) -> float:
        brokerage = min(self.brokerage_pct * value, self.brokerage_cap)
        exchange, sebi = value * self.exchange, value * self.sebi
        stt = value * self.stt_sell if side == "SELL" else 0.0
        stamp = value * self.stamp_buy if side == "BUY" else 0.0
        return brokerage + exchange + sebi + stt + stamp + self.gst * (brokerage + exchange + sebi)


# ---------------------------------------------------------------- simulation


@dataclass(frozen=True)
class Params:
    lookback: int = 250
    zwin: int = 60
    entry: float = 2.0
    exit: float = 0.5
    stop: float = 4.0
    max_hold: int = 60
    coint_filter: bool = False

    @property
    def name(self) -> str:
        f = " coint" if self.coint_filter else ""
        return f"L={self.lookback} W={self.zwin} z={self.entry}{f}"


@dataclass
class Result:
    params: Params
    trades: int = 0
    wins: int = 0
    hold_days: int = 0
    days_in_market: int = 0
    gross_pnl: float = 0.0
    costs: float = 0.0
    tax: float = 0.0
    start_equity: float = 0.0
    curve: list[tuple[date, float]] | None = None


def simulate(
    days,
    a_open,
    a_close,
    b_open,
    b_close,
    p: Params,
    capital: float,
    gross_lev: float,
    costs: Costs,
    tax_rate: float,
) -> Result:
    la = [math.log(x) for x in a_close]
    lb = [math.log(x) for x in b_close]
    res = Result(params=p, start_equity=capital, curve=[])
    equity = capital
    pos = 0  # +1 long A/short B; -1 short A/long B
    qa = qb = 0.0
    held = 0
    entry_equity = 0.0
    pending = None  # ("open", sign, beta) or ("close",)
    fy = financial_year(days[0])
    fy_pnl = 0.0
    carry_loss = 0.0

    def trade_cost(values_sides):
        return sum(costs.order(v, s) for v, s in values_sides)

    for i in range(len(days)):
        day = days[i]
        # Financial-year tax on the previous year's net trading profit.
        if financial_year(day) != fy:
            taxable = fy_pnl - carry_loss
            if taxable > 0:
                tax = taxable * tax_rate
                equity -= tax
                res.tax += tax
                carry_loss = 0.0
            else:
                carry_loss = -taxable
            fy, fy_pnl = financial_year(day), 0.0

        # Morning: execute yesterday's decision at today's open.
        if pending and i > 0:
            if pending[0] == "close" and pos != 0:
                # mark from yesterday's close to today's open, then exit with slippage
                pnl = pos * (qa * (a_open[i] - a_close[i - 1]) - qb * (b_open[i] - b_close[i - 1]))
                va, vb = qa * a_open[i], qb * b_open[i]
                slip = costs.slippage * (va + vb)
                c = slip + trade_cost(
                    [(va, "SELL" if pos > 0 else "BUY"), (vb, "BUY" if pos > 0 else "SELL")]
                )
                equity += pnl - c
                fy_pnl += pnl - c
                res.gross_pnl += pnl
                res.costs += c
                res.trades += 1
                res.wins += equity > entry_equity
                res.hold_days += held
                pos, qa, qb, held = 0, 0.0, 0.0, 0
                marked_today_from_open = True
            elif pending[0] == "open" and pos == 0:
                sign, beta = pending[1], pending[2]
                gross = equity * gross_lev
                va = gross / (1 + beta)
                vb = gross - va
                qa, qb = va / a_open[i], vb / b_open[i]
                slip = costs.slippage * gross
                c = slip + trade_cost(
                    [(va, "BUY" if sign > 0 else "SELL"), (vb, "SELL" if sign > 0 else "BUY")]
                )
                equity -= c
                fy_pnl -= c
                res.costs += c
                entry_equity = equity + c
                pos, held = sign, 0
                marked_today_from_open = True
            else:
                marked_today_from_open = False
            pending = None
        else:
            marked_today_from_open = False

        # Mark to market at today's close.
        if pos != 0:
            if marked_today_from_open:
                pnl = pos * (qa * (a_close[i] - a_open[i]) - qb * (b_close[i] - b_open[i]))
            else:
                pnl = pos * (
                    qa * (a_close[i] - a_close[i - 1]) - qb * (b_close[i] - b_close[i - 1])
                )
            equity += pnl
            fy_pnl += pnl
            res.gross_pnl += pnl
            held += 1
            res.days_in_market += 1
            # Monthly futures rollover: close and reopen both legs.
            if i + 1 < len(days) and days[i + 1].month != day.month:
                va, vb = qa * a_close[i], qb * b_close[i]
                c = 2 * (trade_cost([(va, "BUY"), (vb, "SELL")])) + costs.slippage * (va + vb)
                equity -= c
                fy_pnl -= c
                res.costs += c
        res.curve.append((day, equity))

        # After close: decide for tomorrow.
        if i + 1 >= len(days) or i + 1 < p.lookback:
            continue
        lo = i - p.lookback + 1
        alpha, beta = ols(lb[lo : i + 1], la[lo : i + 1])
        if beta <= 0:
            continue
        spread = [la[k] - beta * lb[k] - alpha for k in range(lo, i + 1)]
        recent = spread[-p.zwin :]
        mean = sum(recent) / len(recent)
        sd = math.sqrt(sum((s - mean) ** 2 for s in recent) / (len(recent) - 1))
        if sd == 0:
            continue
        z = (spread[-1] - mean) / sd

        if pos == 0:
            if abs(z) > p.entry:
                if p.coint_filter and adf_t(spread)[0] > EG_CRIT_5PCT:
                    continue
                pending = ("open", -1 if z > 0 else 1, beta)
        else:
            reverted = (pos > 0 and z >= -p.exit) or (pos < 0 and z <= p.exit)
            if reverted or abs(z) > p.stop or held >= p.max_hold:
                pending = ("close",)

    # Final tax on the year in progress.
    taxable = fy_pnl - carry_loss
    if taxable > 0:
        res.tax += taxable * tax_rate
        res.curve[-1] = (res.curve[-1][0], res.curve[-1][1] - taxable * tax_rate)
    return res


# ---------------------------------------------------------------- reporting


def summarize(r: Result) -> dict:
    curve = r.curve
    start, end = curve[0][0], curve[-1][0]
    years = (end - start).days / 365.25
    final = curve[-1][1]
    cagr = (final / r.start_equity) ** (1 / years) - 1 if years > 0 and final > 0 else -1.0
    peak, max_dd = curve[0][1], 0.0
    for _, v in curve:
        peak = max(peak, v)
        max_dd = min(max_dd, v / peak - 1)
    return {
        "name": r.params.name,
        "cagr": round(cagr * 100, 2),
        "max_dd": round(max_dd * 100, 2),
        "trades": r.trades,
        "win": round(100 * r.wins / r.trades, 1) if r.trades else 0.0,
        "hold": round(r.hold_days / r.trades, 1) if r.trades else 0.0,
        "in_mkt": round(100 * r.days_in_market / len(curve), 1),
        "gross": round(r.gross_pnl),
        "costs": round(r.costs),
        "tax": round(r.tax),
        "final": round(final),
    }


def table(headers, rows):
    cells = [headers] + [[str(c) for c in row] for row in rows]
    widths = [max(len(r[i]) for r in cells) for i in range(len(headers))]
    for n, row in enumerate(cells):
        print("  ".join(c.ljust(widths[i]) for i, c in enumerate(row)))
        if n == 0:
            print("  ".join("-" * w for w in widths))


def diagnostics(name, la, lb):
    alpha, beta = ols(lb, la)
    spread = [x - beta * y - alpha for x, y in zip(la, lb, strict=True)]
    t, b = adf_t(spread)
    verdict = "cointegrated" if t < EG_CRIT_5PCT else "NOT cointegrated"
    print(
        f"{name}: full-period beta={beta:.3f}, Engle-Granger t={t:.2f} "
        f"(5% crit {EG_CRIT_5PCT}) → {verdict}; half-life {half_life(b):.0f} sessions"
    )


def rolling_coint_share(la, lb, window=250, step=20):
    hits = total = 0
    for end in range(window, len(la), step):
        alpha, beta = ols(lb[end - window : end], la[end - window : end])
        spread = [la[k] - beta * lb[k] - alpha for k in range(end - window, end)]
        total += 1
        hits += adf_t(spread)[0] < EG_CRIT_5PCT
    return 100 * hits / total if total else 0.0


GRID = [
    Params(lookback=L, zwin=W, entry=z, coint_filter=f)
    for L in (120, 250)
    for W in (20, 60)
    for z in (1.5, 2.0, 2.5)
    for f in (False, True)
]


def main():
    ap = argparse.ArgumentParser(description="Daily pairs-trading backtest (futures proxy)")
    ap.add_argument("--pairs", default="HDFCBANK.NS/ICICIBANK.NS,TCS.NS/INFY.NS")
    ap.add_argument("--from", dest="start", default="2010-01-01")
    ap.add_argument("--to", dest="end", default=date.today().isoformat())
    ap.add_argument("--split", default=None, help="out-of-sample start date")
    ap.add_argument("--capital", type=float, default=1_000_000)
    ap.add_argument("--gross-leverage", type=float, default=2.0)
    ap.add_argument("--tax-pct", type=float, default=31.2, help="slab + cess on F&O profit")
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    costs = Costs()

    for pair in args.pairs.split(","):
        ta, tb = pair.strip().split("/")
        bars_a = {b.day: b for b in data.load(ta, args.refresh, dividends=False)}
        bars_b = {b.day: b for b in data.load(tb, args.refresh, dividends=False)}
        all_days = sorted(set(bars_a) & set(bars_b))
        start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
        days = [d for d in all_days if start <= d <= end]
        la = [math.log(float(bars_a[d].close)) for d in days]
        lb = [math.log(float(bars_b[d].close)) for d in days]

        print(f"\n################ {ta} vs {tb}: {days[0]} → {days[-1]} ({len(days)} sessions)")
        diagnostics(f"{ta}/{tb}", la, lb)
        share = rolling_coint_share(la, lb)
        print(f"Rolling 1-year windows cointegrated at 5%: {share:.0f}%")

        periods = [("full", days)]
        if args.split:
            s = date.fromisoformat(args.split)
            periods = [
                ("in-sample", [d for d in days if d < s]),
                ("out-of-sample", [d for d in days if d >= s]),
            ]

        all_rows = {}
        for label, pdays in periods:
            series = [
                [float(bars_a[d].open) for d in pdays],
                [float(bars_a[d].close) for d in pdays],
                [float(bars_b[d].open) for d in pdays],
                [float(bars_b[d].close) for d in pdays],
            ]
            rows = [
                summarize(
                    simulate(
                        pdays,
                        *series,
                        p,
                        args.capital,
                        args.gross_leverage,
                        costs,
                        args.tax_pct / 100,
                    )
                )
                for p in GRID
            ]
            all_rows[label] = rows
            print(f"\n--- {label}: {pdays[0]} → {pdays[-1]} (after costs and tax) ---")
            rows_sorted = sorted(rows, key=lambda r: r["cagr"], reverse=True)
            table(
                [
                    "Params",
                    "CAGR %",
                    "MaxDD %",
                    "Trades",
                    "Win %",
                    "Avg hold",
                    "In mkt %",
                    "Gross P&L",
                    "Costs",
                    "Tax",
                    "Final",
                ],
                [
                    [
                        r["name"],
                        r["cagr"],
                        r["max_dd"],
                        r["trades"],
                        r["win"],
                        r["hold"],
                        r["in_mkt"],
                        f"{r['gross']:,}",
                        f"{r['costs']:,}",
                        f"{r['tax']:,}",
                        f"{r['final']:,}",
                    ]
                    for r in rows_sorted
                ],
            )
            positive = sum(r["cagr"] > 0 for r in rows)
            print(f"Profitable parameter sets: {positive} of {len(rows)}")

        if args.split:
            ins = {r["name"]: r for r in all_rows["in-sample"]}
            oos = {r["name"]: r for r in all_rows["out-of-sample"]}
            best = max(ins.values(), key=lambda r: r["cagr"])
            oos_rank = sorted(oos.values(), key=lambda r: r["cagr"], reverse=True)
            rank = [r["name"] for r in oos_rank].index(best["name"]) + 1
            print(
                f"\nBest in-sample: {best['name']} (CAGR {best['cagr']}%) → "
                f"out-of-sample CAGR {oos[best['name']]['cagr']}%, rank {rank} of {len(oos)}"
            )


if __name__ == "__main__":
    main()
