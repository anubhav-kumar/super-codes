"""Tier 1 portfolio features (backtest): deposit routing, partial rebalancing, tax harvesting.

All functions are pure: they look at the account/tax book and return orders. The simulator
executes them at the next session's open like any other order.
"""

from datetime import date
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal

from backtest.costs import EQUITY_CATEGORY, LONG_TERM, LT_EQUITY, TaxBook, fifo_prefix
from backtest.costs import realized_this_year as realized
from src.config import PortfolioConfig
from src.models import CASH, Account, Order, Quote, Side

HUNDRED = Decimal(100)
MIN_HARVEST_GAIN = Decimal(1000)  # below this, charges eat the benefit
MIN_HARVEST_LOSS = Decimal(1000)


def _floor(x: Decimal) -> int:
    return max(int(x.to_integral_value(ROUND_FLOOR)), 0)


def _values(account: Account, quotes: dict[str, Quote], tickers: list[str]):
    cur = {t: account.quantity(t) * quotes[t].price for t in tickers}
    total = account.cash + sum(cur.values(), Decimal(0))
    return cur, total


def _tickers(account: Account, config: PortfolioConfig) -> list[str]:
    return sorted(set(config.tickers) | set(account.holdings))


def _buy_orders(
    allocations: dict[str, Decimal], quotes: dict[str, Quote], day: str, buffer: Decimal
) -> list[Order]:
    orders = []
    ranked = sorted(allocations.items(), key=lambda kv: kv[1], reverse=True)
    for rank, (t, value) in enumerate(ranked, start=1):
        qty = _floor(value / (quotes[t].price * buffer))
        if qty > 0:
            orders.append(Order(day, t, Side.BUY, qty, priority=rank))
    return orders


# ---------------------------------------------------------------- deposit routing


def route_cash(
    account: Account,
    quotes: dict[str, Quote],
    config: PortfolioConfig,
    day: str,
    buffer: Decimal = Decimal("1.005"),
) -> list[Order]:
    """Invest cash above the CASH target into the most underweight tickers. Never sells."""
    tickers = _tickers(account, config)
    cur, total = _values(account, quotes, tickers)
    investable = account.cash - total * config.target(CASH) / HUNDRED
    if investable <= 0:
        return []
    shortfall = {
        t: max(total * config.target(t) / HUNDRED - cur[t], Decimal(0)) for t in config.tickers
    }
    gap = sum(shortfall.values(), Decimal(0))
    if gap >= investable:
        alloc = {t: investable * s / gap for t, s in shortfall.items() if s > 0}
    else:  # fill every shortfall, spread the rest by target weight
        extra = investable - gap
        weight_sum = sum((config.target(t) for t in config.tickers), Decimal(0))
        alloc = {t: shortfall[t] + extra * config.target(t) / weight_sum for t in config.tickers}
    return _buy_orders(alloc, quotes, day, buffer)


# ---------------------------------------------------------------- partial rebalancing


def partial_rebalance(
    account: Account,
    quotes: dict[str, Quote],
    config: PortfolioConfig,
    day: str,
    buffer: Decimal = Decimal("1.005"),
) -> list[Order]:
    """Trade only components outside the drift band, back to halfway inside the band.

    Tickers: overweight beyond the band are sold to target + threshold/2; underweight beyond
    the band are bought to target - threshold/2. CASH outside the band is fixed by buying
    underweights (excess cash) or selling overweights (cash shortfall), also to the half-band.
    """
    th = config.drift_threshold_pct
    tickers = _tickers(account, config)
    cur, total = _values(account, quotes, tickers)
    if total <= 0:
        return []

    def pct(v):
        return v / total * HUNDRED

    desired = dict(cur)
    for t in tickers:
        drift = pct(cur[t]) - config.target(t)
        if drift > th:
            desired[t] = total * (config.target(t) + th / 2) / HUNDRED
        elif drift < -th:
            desired[t] = total * max(config.target(t) - th / 2, Decimal(0)) / HUNDRED
    if any(t not in config.targets for t in tickers):  # dropped tickers: sell fully
        for t in tickers:
            if t not in config.targets:
                desired[t] = Decimal(0)

    cash_after = total - sum(desired.values(), Decimal(0))
    cash_target = config.target(CASH)
    if pct(cash_after) > cash_target + th:
        excess = cash_after - total * (cash_target + th / 2) / HUNDRED
        under = {t: total * config.target(t) / HUNDRED - desired[t] for t in config.tickers}
        under = {t: v for t, v in under.items() if v > 0}
        base = sum(under.values(), Decimal(0))
        for t, v in under.items():
            desired[t] += min(v, excess * v / base) if base > 0 else 0
    elif pct(cash_after) < cash_target - th:
        need = total * (cash_target - th / 2) / HUNDRED - cash_after
        over = {t: desired[t] - total * config.target(t) / HUNDRED for t in config.tickers}
        over = {t: v for t, v in over.items() if v > 0}
        base = sum(over.values(), Decimal(0))
        for t, v in over.items():
            desired[t] -= need * v / base if base > 0 else 0

    orders: list[Order] = []
    buys: dict[str, Decimal] = {}
    for t in tickers:
        delta = desired[t] - cur[t]
        if delta < 0:
            qty = min(
                int((-delta / quotes[t].price).to_integral_value(ROUND_CEILING)),
                account.quantity(t),
            )
            if qty > 0:
                orders.append(Order(day, t, Side.SELL, qty))
        elif delta > 0:
            buys[t] = delta
    return orders + _buy_orders(buys, quotes, day, buffer)


# ---------------------------------------------------------------- tax harvesting


def harvest_orders(
    book: TaxBook,
    account: Account,
    quotes: dict[str, Quote],
    day: date,
    exemption: Decimal,
) -> tuple[list[Order], Decimal, Decimal]:
    """Sell-and-rebuy orders for (1) tax-loss harvesting and (2) using the yearly LTCG
    exemption on equity. Returns (orders, expected realized loss, expected exempt gain)."""
    sells: dict[str, int] = {}
    loss_total = Decimal(0)

    # 1. Loss harvesting: per ticker, sell the FIFO prefix that realizes the largest net loss.
    for t in sorted(account.holdings):
        px = quotes[t].price
        best_units, best_gain = 0, Decimal(0)
        for units, gain, *_ in _prefixes(book, t, px, day):
            if gain < best_gain:
                best_units, best_gain = units, gain
        if best_gain <= -MIN_HARVEST_LOSS:
            sells[t] = best_units
            loss_total += -best_gain

    # 2. LTCG harvesting on equity: realize long-term gains up to the remaining exemption.
    remaining = exemption - max(realized(book, day, LT_EQUITY), Decimal(0))
    gain_total = Decimal(0)
    for t in sorted(account.holdings):
        if remaining < MIN_HARVEST_GAIN:
            break
        if book.model.instruments[t]["tax"] != EQUITY_CATEGORY or t in sells:
            continue
        px = quotes[t].price
        units_sold, realized_gain = 0, Decimal(0)
        for units, gain, all_long, per_unit, lot_qty, bucket in fifo_prefix(book, t, px, day):
            if bucket not in LONG_TERM or not all_long:
                break
            room = remaining - gain
            if per_unit <= 0:
                units_sold, realized_gain = units + lot_qty, gain + per_unit * lot_qty
                continue
            take = min(lot_qty, _floor(room / per_unit))
            units_sold, realized_gain = units + take, gain + per_unit * take
            if take < lot_qty:
                break
        if realized_gain >= MIN_HARVEST_GAIN and units_sold > 0:
            sells[t] = units_sold
            remaining -= realized_gain
            gain_total += realized_gain

    orders: list[Order] = []
    for t, qty in sells.items():
        orders.append(Order(day.isoformat(), t, Side.SELL, qty))
        orders.append(Order(day.isoformat(), t, Side.BUY, qty, priority=0))
    return orders, loss_total, gain_total


def _prefixes(book: TaxBook, ticker: str, px: Decimal, day: date):
    """Cumulative (units, gain) after each whole lot, FIFO."""
    for units, gain, _all_long, per_unit, lot_qty, _bucket in fifo_prefix(book, ticker, px, day):
        yield units + lot_qty, gain + per_unit * lot_qty
