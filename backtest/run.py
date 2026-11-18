"""Backtest CLI.

    .venv/bin/python -m backtest.run --monthly-deposit 5000
    .venv/bin/python -m backtest.run --policies fixed,trend --thresholds 5,10 --split 2020-01-01
    .venv/bin/python -m backtest.run --costs none          # ignore charges and taxes

Runs the production rebalancing strategy for every combination of weight policy, drift
threshold, step and SMA pair, plus benchmarks (buy-and-hold of the target weights, and 100% of
a benchmark ticker). Charges and capital gains tax are applied by default (backtest/costs.json).

With --split, every run is simulated separately on the in-sample period [--from, --split) and
the out-of-sample period [--split, --to], each starting from the initial capital, and the
in-sample ranking is compared with the out-of-sample one.

Writes equity, trade and weight-change CSVs to backtest/results/.
"""

import argparse
import csv
import dataclasses
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from backtest import data, metrics
from backtest.costs import CostModel
from backtest.signals import DynamicWeights, crossovers
from backtest.simulator import SimResult, common_days, simulate
from src.config import PortfolioConfig, load_portfolio_config

RESULTS_DIR = Path(__file__).resolve().parent / "results"


def _args():
    p = argparse.ArgumentParser(description="Backtest the rebalancing strategy")
    p.add_argument("--from", dest="start", default="2010-01-01")
    p.add_argument("--to", dest="end", default=date.today().isoformat())
    p.add_argument("--split", default=None, help="out-of-sample start date (YYYY-MM-DD)")
    p.add_argument(
        "--config", default=None, help="portfolio config (default config/portfolio.json)"
    )
    p.add_argument("--initial", default="5000")
    p.add_argument("--monthly-deposit", default="0")
    p.add_argument("--slippage-pct", default="0.05")
    p.add_argument("--costs", choices=["all", "charges", "none"], default="all")
    p.add_argument("--thresholds", default="5")
    p.add_argument("--policies", default="fixed", help="comma list: fixed, contrarian, trend")
    p.add_argument("--steps", default="5", help="comma list of weight points per crossover")
    p.add_argument(
        "--sma-pairs", default="50/200", help="comma list of fast/slow, e.g. 50/200,20/100"
    )
    p.add_argument("--max-weight", default="40", help="cap on any ticker's target weight")
    p.add_argument(
        "--features",
        default="none",
        help="comma list of feature sets, each joined by '+': none, routing, partial, harvest, "
        "all (e.g. none,routing,partial,harvest,all or routing+harvest)",
    )
    p.add_argument("--benchmark", default="NIFTYBEES.NS")
    p.add_argument("--refresh", action="store_true", help="re-download price history")
    return p.parse_args()


def _list(value: str) -> list[str]:
    return [x.strip() for x in value.split(",") if x.strip()]


@dataclasses.dataclass(frozen=True)
class Variant:
    name: str
    policy: str
    threshold: Decimal
    step: Decimal
    sma: tuple[int, int]
    features: frozenset[str] = frozenset()


ALL_FEATURES = frozenset({"routing", "partial", "harvest"})


def _feature_sets(value: str) -> list[frozenset[str]]:
    sets = []
    for item in _list(value):
        parts = set(item.split("+"))
        if "all" in parts:
            parts = set(ALL_FEATURES)
        parts.discard("none")
        unknown = parts - ALL_FEATURES
        if unknown:
            raise SystemExit(f"unknown features {sorted(unknown)}")
        sets.append(frozenset(parts))
    return sets


def _with_features(variants: list[Variant], sets: list[frozenset[str]]) -> list[Variant]:
    out = []
    for v in variants:
        for fs in sets:
            label = " +" + "+".join(sorted(fs)) if fs else ""
            out.append(dataclasses.replace(v, name=v.name + label, features=fs))
    return out


def _variants(args) -> list[Variant]:
    variants = []
    pairs = [tuple(int(n) for n in pair.split("/")) for pair in _list(args.sma_pairs)]
    for policy in _list(args.policies):
        for th in map(Decimal, _list(args.thresholds)):
            if policy == "fixed":
                variants.append(Variant(f"fixed d={th}", policy, th, Decimal(0), (0, 0)))
                continue
            for step in map(Decimal, _list(args.steps)):
                for fast, slow in pairs:
                    name = f"{policy} d={th} s={step} {fast}/{slow}"
                    variants.append(Variant(name, policy, th, step, (fast, slow)))
    return _with_features(variants, _feature_sets(args.features))


def _slug(name: str) -> str:
    return "".join(c if c.isalnum() or c in "-." else "_" for c in name)


def _write_csv(result: SimResult, label: str) -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    slug = _slug(f"{label}_{result.name}")
    with open(RESULTS_DIR / f"equity_{slug}.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date", "value", "cash", "deposit"])
        for p in result.curve:
            w.writerow([p.day.isoformat(), p.value, p.cash, p.deposit])
    with open(RESULTS_DIR / f"trades_{slug}.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date", "ticker", "side", "quantity", "price", "value"])
        for t in result.trades:
            w.writerow([t.day.isoformat(), t.ticker, t.side, t.quantity, t.price, t.value])
    if result.weights and result.weights.events:
        tickers = list(result.weights.targets)
        with open(RESULTS_DIR / f"weights_{slug}.csv", "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["date", "ticker", "signal", "change", *tickers])
            for e in result.weights.events:
                w.writerow(
                    [e.day.isoformat(), e.ticker, e.signal, e.change]
                    + [e.targets[t] for t in tickers]
                )


def _table(headers: list[str], rows: list[list]) -> None:
    cells = [headers] + [[str(c) for c in r] for r in rows]
    widths = [max(len(r[i]) for r in cells) for i in range(len(headers))]
    for n, row in enumerate(cells):
        print("  ".join(c.ljust(widths[i]) for i, c in enumerate(row)))
        if n == 0:
            print("  ".join("-" * w for w in widths))


def _print_metrics(rows: list[metrics.Metrics]) -> None:
    _table(
        [
            "Run",
            "CAGR %",
            "XIRR %",
            "XIRR liq %",
            "MaxDD %",
            "Vol %",
            "Final INR",
            "Liquidated",
            "Invested",
            "Charges",
            "Tax",
            "Rebal",
            "Harv",
            "Trades",
        ],
        [
            [
                m.name,
                m.cagr_pct,
                m.xirr_pct,
                m.xirr_liq_pct,
                m.max_drawdown_pct,
                m.volatility_pct,
                f"{m.final_value:,.0f}",
                f"{m.liquidation_value:,.0f}",
                f"{m.invested:,.0f}",
                f"{m.charges:,.0f}",
                f"{m.taxes:,.0f}",
                m.rebalances,
                m.harvests,
                m.trades,
            ]
            for m in rows
        ],
    )


def _run_period(args, config, history, signals_cache, costs, start, end, label):
    initial = Decimal(args.initial)
    deposit = Decimal(args.monthly_deposit)
    slippage = Decimal(args.slippage_pct)
    strategy_history = {t: history[t] for t in config.tickers}
    days = common_days(history, start, end)
    if len(days) < 2:
        raise SystemExit(f"{label}: not enough overlapping trading days")
    print(f"\n=== {label}: {days[0]} → {days[-1]} ({len(days)} sessions) ===")

    runs: list[SimResult] = []
    for v in _variants(args):
        cfg = dataclasses.replace(config, drift_threshold_pct=v.threshold)
        weights = None
        if v.policy != "fixed":
            if v.sma not in signals_cache:
                signals_cache[v.sma] = {t: crossovers(history[t], *v.sma) for t in config.tickers}
            weights = DynamicWeights(
                config.targets,
                signals_cache[v.sma],
                v.policy,
                v.step,
                Decimal(args.max_weight),
            )
        runs.append(
            simulate(
                v.name,
                cfg,
                strategy_history,
                days,
                initial,
                deposit,
                slippage,
                weights=weights,
                costs=costs,
                features=v.features,
            )
        )

    runs.append(
        simulate(
            "buy-and-hold targets",
            config,
            strategy_history,
            days,
            initial,
            deposit,
            slippage,
            mode="buy_and_hold",
            costs=costs,
        )
    )
    bench_cfg = PortfolioConfig(Decimal(100), {args.benchmark: Decimal(100)})
    runs.append(
        simulate(
            f"100% {args.benchmark}",
            bench_cfg,
            {args.benchmark: history[args.benchmark]},
            days,
            initial,
            deposit,
            slippage,
            mode="buy_and_hold",
            costs=costs,
        )
    )

    rows = [metrics.compute(r, float(initial)) for r in runs]
    for r in runs:
        _write_csv(r, label)
    _print_metrics(rows)
    return rows


def _compare(in_rows: list[metrics.Metrics], out_rows: list[metrics.Metrics]) -> None:
    def ranks(rows):
        ordered = sorted(rows, key=lambda m: m.xirr_pct, reverse=True)
        return {m.name: i for i, m in enumerate(ordered, start=1)}

    in_rank, out_rank = ranks(in_rows), ranks(out_rows)
    out_by_name = {m.name: m for m in out_rows}
    print("\n=== In-sample vs out-of-sample (ranked by in-sample XIRR) ===")
    _table(
        ["Run", "IS XIRR %", "IS rank", "OOS XIRR %", "OOS rank", "OOS MaxDD %"],
        [
            [
                m.name,
                m.xirr_pct,
                in_rank[m.name],
                out_by_name[m.name].xirr_pct,
                out_rank[m.name],
                out_by_name[m.name].max_drawdown_pct,
            ]
            for m in sorted(in_rows, key=lambda m: in_rank[m.name])
        ],
    )
    best = min(in_rows, key=lambda m: in_rank[m.name])
    n = len(out_rows)
    print(f"\nBest in-sample: {best.name} → out-of-sample rank {out_rank[best.name]} of {n}")


def main() -> None:
    args = _args()
    config = load_portfolio_config(Path(args.config) if args.config else None)
    costs = CostModel(charges=args.costs != "none", taxes=args.costs == "all")
    tickers = sorted(set(config.tickers) | {args.benchmark})
    if args.costs != "none":
        costs.check(tickers)

    history = {t: data.load(t, refresh=args.refresh) for t in tickers}
    for t in tickers:
        print(f"{t}: history from {history[t][0].day} to {history[t][-1].day}")
    print(
        f"Initial INR {args.initial}, monthly deposit INR {args.monthly_deposit}, "
        f"slippage {args.slippage_pct}%, costs={args.costs}"
    )

    start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
    signals_cache: dict = {}
    if args.split:
        split = date.fromisoformat(args.split)
        in_rows = _run_period(
            args,
            config,
            history,
            signals_cache,
            costs,
            start,
            split - timedelta(days=1),
            "in-sample",
        )
        out_rows = _run_period(
            args, config, history, signals_cache, costs, split, end, "out-of-sample"
        )
        _compare(in_rows, out_rows)
    else:
        _run_period(args, config, history, signals_cache, costs, start, end, "full")
    print(f"\nCSVs written to {RESULTS_DIR}")


if __name__ == "__main__":
    main()
