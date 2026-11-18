"""Day-by-day backtest of the production strategy (`src/strategy/rebalance.py`).

Mirrors the live flow, with an in-memory account instead of DynamoDB:
- After each close, the strategy runs on closing prices and creates orders.
- At the next session's open, SELLs fill first, then BUYs (by priority) using the
  same-day sale proceeds. Both fill at the open, with slippage against us.
- Holding guard caps SELLs at the held quantity; cash guard caps BUYs at what cash covers.
- Charges are deducted per trade; capital gains tax for each financial year is paid on the
  first session of the next one (and on the last day for the year in progress). See costs.py.

Modes:
- "rebalance": the real strategy, every day.
- "buy_and_hold": buy target weights once at the start; deposits are invested at target
  weights; never rebalanced.
"""

import copy
import dataclasses
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_FLOOR, Decimal

from backtest.costs import CostModel, TaxBook, financial_year
from backtest.data import DailyBar
from backtest.signals import DynamicWeights
from backtest.tier1 import harvest_orders, partial_rebalance, route_cash
from src.config import PortfolioConfig
from src.models import Account, Holding, Order, Quote, Side, money, price
from src.strategy.rebalance import rebalance


@dataclass
class Trade:
    day: date
    ticker: str
    side: str
    quantity: int
    price: Decimal
    value: Decimal


@dataclass
class DayPoint:
    day: date
    value: Decimal
    cash: Decimal
    deposit: Decimal


@dataclass
class SimResult:
    name: str
    curve: list[DayPoint] = field(default_factory=list)
    trades: list[Trade] = field(default_factory=list)
    rebalances: int = 0
    weights: DynamicWeights | None = None
    charges: Decimal = Decimal(0)
    taxes: Decimal = Decimal(0)
    harvests: int = 0
    liquidation_value: Decimal = Decimal(0)


def common_days(history: dict[str, list[DailyBar]], start: date, end: date) -> list[date]:
    sets = [{b.day for b in bars} for bars in history.values()]
    return sorted(d for d in set.intersection(*sets) if start <= d <= end)


def _floor(x: Decimal) -> int:
    return int(x.to_integral_value(ROUND_FLOOR))


def simulate(
    name: str,
    config: PortfolioConfig,
    history: dict[str, list[DailyBar]],
    days: list[date],
    initial_cash: Decimal,
    monthly_deposit: Decimal,
    slippage_pct: Decimal,
    mode: str = "rebalance",
    weights: DynamicWeights | None = None,
    costs: CostModel | None = None,
    features: frozenset[str] = frozenset(),
) -> SimResult:
    """features: subset of {"routing", "partial", "harvest"} (see backtest/tier1.py)."""
    bars = {t: {b.day: b for b in series} for t, series in history.items()}
    slip = slippage_pct / Decimal(100)
    cash = money(initial_cash)
    holdings: dict[str, int] = {}
    pending: list[Order] = []
    result = SimResult(name=name, weights=weights)
    bought_once = False
    costs = costs or CostModel(charges=False, taxes=False)
    book = TaxBook(costs)
    fy = financial_year(days[0])
    sold_today: set[str] = set()
    harvested_fy = None

    def fill(day: date, order: Order) -> None:
        nonlocal cash
        bar_open = bars[order.ticker][day].open
        if order.side == Side.SELL:
            qty = min(order.quantity, holdings.get(order.ticker, 0))
            px = price(bar_open * (1 - slip))
            if qty == 0:
                return
            value = money(qty * px)
            tc = costs.trade_cost(order.ticker, "SELL", value)
            dp = Decimal(0) if order.ticker in sold_today else costs.dp_charge()
            sold_today.add(order.ticker)
            cash += value - tc.total - dp
            result.charges += tc.total + dp
            book.sell(order.ticker, day, qty, value - (tc.total - tc.stt) - dp)
            holdings[order.ticker] -= qty
        else:
            px = price(bar_open * (1 + slip))
            unit = px * (1 + costs.buy_cost_factor(order.ticker))
            qty = min(order.quantity, max(_floor(cash / unit), 0))
            if qty == 0:
                return
            value = money(qty * px)
            tc = costs.trade_cost(order.ticker, "BUY", value)
            cash -= value + tc.total
            result.charges += tc.total
            book.buy(order.ticker, day, qty, value + tc.total - tc.stt)
            holdings[order.ticker] = holdings.get(order.ticker, 0) + qty
        result.trades.append(Trade(day, order.ticker, str(order.side), qty, px, money(qty * px)))

    def pay_tax(year: int) -> None:
        nonlocal cash
        tax = book.close_year(year)
        cash -= tax
        result.taxes += tax

    for i, day in enumerate(days):
        # 0. New financial year: pay the previous year's capital gains tax.
        if financial_year(day) != fy:
            pay_tax(fy)
            fy = financial_year(day)
        sold_today.clear()

        # 1. Morning: execute yesterday's orders at today's open.
        sells = [o for o in pending if o.side == Side.SELL]
        buys = sorted(
            (o for o in pending if o.side == Side.BUY),
            key=lambda o: (o.priority is None, o.priority or 0),
        )
        for order in sells + buys:
            fill(day, order)
        pending = []

        # 2. Monthly deposit on the first session of each new month.
        deposit = Decimal(0)
        if monthly_deposit > 0 and i > 0 and day.month != days[i - 1].month:
            deposit = money(monthly_deposit)
            cash += deposit

        # Last day: value a full liquidation after tax, then settle tax for the year in progress.
        if i == len(days) - 1:
            result.liquidation_value = _liquidation_value(
                book,
                holdings,
                cash,
                {t: bars[t][day].close for t in holdings},
                day,
                fy,
                costs,
                slip,
            )
            pay_tax(fy)

        # 3. After close: value the account and run the strategy.
        quotes = {t: Quote(t, bars[t][day].close, day) for t in history}
        value = cash + sum((q * quotes[t].price for t, q in holdings.items()), Decimal(0))
        result.curve.append(DayPoint(day, money(value), money(cash), deposit))

        if i == len(days) - 1:
            break
        account = Account(
            cash=cash,
            holdings={t: Holding(t, q, Decimal(0)) for t, q in holdings.items() if q > 0},
        )
        # Tax harvesting: once per financial year, in the second half of March.
        if (
            "harvest" in features
            and mode == "rebalance"
            and day.month == 3
            and day.day >= 15
            and harvested_fy != fy
        ):
            harvested_fy = fy
            orders, _, _ = harvest_orders(book, account, quotes, day, costs.ltcg_exemption)
            if orders:
                result.harvests += 1
                pending = orders
                continue

        if mode == "rebalance":
            cfg = config
            if weights is not None:
                changed = weights.update(day)
                cfg = dataclasses.replace(config, targets=dict(weights.targets))
                if changed:
                    # A weight change forces a rebalance to the new targets.
                    cfg = dataclasses.replace(cfg, drift_threshold_pct=Decimal(0))
            if "routing" in features and deposit > 0:
                orders = route_cash(account, quotes, cfg, day.isoformat())
            elif "partial" in features:
                orders = partial_rebalance(account, quotes, cfg, day.isoformat())
            else:
                orders = rebalance(account, quotes, cfg, day.isoformat()).orders
            if orders:
                result.rebalances += 1
            pending = orders
        elif not bought_once:
            # Threshold 0 forces the initial purchase regardless of the configured threshold.
            initial_cfg = dataclasses.replace(config, drift_threshold_pct=Decimal(0))
            pending = rebalance(account, quotes, initial_cfg, day.isoformat()).orders
            bought_once = True
        elif deposit > 0:
            pending = _invest_deposit(deposit, quotes, config, day)

    return result


def _invest_deposit(
    amount: Decimal, quotes: dict[str, Quote], config: PortfolioConfig, day: date
) -> list[Order]:
    orders = []
    for rank, ticker in enumerate(config.tickers, start=1):
        qty = _floor(amount * config.target(ticker) / Decimal(100) / quotes[ticker].price)
        if qty > 0:
            orders.append(Order(day.isoformat(), ticker, Side.BUY, qty, priority=rank))
    return orders


def _liquidation_value(book, holdings, cash, closes, day, fy, costs, slip) -> Decimal:
    """Cash left if every holding were sold at today's close and this year's tax paid."""
    book = copy.deepcopy(book)
    for t, qty in holdings.items():
        if qty <= 0:
            continue
        px = price(closes[t] * (1 - slip))
        value = money(qty * px)
        tc = costs.trade_cost(t, "SELL", value)
        dp = costs.dp_charge()
        cash += value - tc.total - dp
        book.sell(t, day, qty, value - (tc.total - tc.stt) - dp)
    return money(cash - book.close_year(fy))
