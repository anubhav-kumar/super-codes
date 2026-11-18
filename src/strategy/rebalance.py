"""Threshold rebalancing (ARCHITECTURE.md §3). Pure: no I/O."""

from dataclasses import dataclass, field
from decimal import ROUND_FLOOR, Decimal

from src.config import PortfolioConfig
from src.models import CASH, Account, Order, Quote, Side, money

HUNDRED = Decimal(100)
WEIGHT_PLACES = Decimal("0.01")


@dataclass
class Component:
    name: str
    quantity: int | None
    price: Decimal | None
    value: Decimal
    target_pct: Decimal
    actual_pct: Decimal

    @property
    def drift_pct(self) -> Decimal:
        return self.actual_pct - self.target_pct


@dataclass
class RebalanceResult:
    total_value: Decimal
    components: list[Component]
    triggered: bool
    orders: list[Order] = field(default_factory=list)


def rebalance(
    account: Account,
    quotes: dict[str, Quote],
    config: PortfolioConfig,
    order_date: str,
) -> RebalanceResult:
    tickers = sorted(set(config.tickers) | set(account.holdings))
    missing = [t for t in tickers if t not in quotes]
    if missing:
        raise ValueError(f"missing quotes for {missing}")

    holdings_value = {t: account.quantity(t) * quotes[t].price for t in tickers}
    total = account.cash + sum(holdings_value.values(), Decimal(0))

    components = [
        _component(t, account.quantity(t), quotes[t].price, holdings_value[t], total, config)
        for t in tickers
    ]
    components.append(_component(CASH, None, None, account.cash, total, config))

    if total <= 0:
        return RebalanceResult(total_value=money(total), components=components, triggered=False)

    triggered = any(abs(c.drift_pct) > config.drift_threshold_pct for c in components)
    orders = _orders(account, quotes, config, tickers, total, order_date) if triggered else []

    buys = sorted(
        (o for o in orders if o.side == Side.BUY),
        key=lambda o: _by_name(components, o.ticker).drift_pct,
    )
    for rank, order in enumerate(buys, start=1):
        order.priority = rank

    return RebalanceResult(
        total_value=money(total), components=components, triggered=triggered, orders=orders
    )


def _component(name, quantity, price, value, total, config) -> Component:
    actual = (value / total * HUNDRED).quantize(WEIGHT_PLACES) if total > 0 else Decimal(0)
    return Component(
        name=name,
        quantity=quantity,
        price=price,
        value=money(value),
        target_pct=config.target(name),
        actual_pct=actual,
    )


def _orders(account, quotes, config, tickers, total, order_date) -> list[Order]:
    orders = []
    for ticker in tickers:
        target_value = total * config.target(ticker) / HUNDRED
        target_qty = int((target_value / quotes[ticker].price).to_integral_value(ROUND_FLOOR))
        delta = target_qty - account.quantity(ticker)
        if delta == 0:
            continue
        side = Side.BUY if delta > 0 else Side.SELL
        orders.append(Order(order_date=order_date, ticker=ticker, side=side, quantity=abs(delta)))
    return orders


def _by_name(components: list[Component], name: str) -> Component:
    return next(c for c in components if c.name == name)
