"""Quant System (ARCHITECTURE.md §4.3). Runs after market close."""

import logging
from decimal import Decimal

from src import clock, reports
from src.brokers.factory import get_broker
from src.config import load_portfolio_config
from src.models import OrderStatus, money
from src.notify import email
from src.store import orders
from src.strategy.rebalance import RebalanceResult, rebalance

log = logging.getLogger(__name__)


def handler(event, context):
    config = load_portfolio_config()
    broker = get_broker()
    today = clock.today().isoformat()

    account = broker.get_account()
    tickers = sorted(set(config.tickers) | set(account.holdings))
    quotes = broker.get_quotes(tickers)

    latest = max((q.date for q in quotes.values()), default=None)
    if latest is None or latest.isoformat() != today:
        log.info("no session today (latest quote %s); stopping", latest)
        return {"status": "no-session", "date": today}
    stale = sorted(t for t, q in quotes.items() if q.date.isoformat() != today)
    if stale:
        raise RuntimeError(f"stale quotes for {stale}; refusing to rebalance on partial data")

    # Only orders from earlier days: a same-day re-run must not expire its own orders.
    expired = [
        o.order_id
        for o in orders.list_by_status(OrderStatus.PENDING)
        if o.order_date < today and orders.mark_expired(o)
    ]

    result = rebalance(account, quotes, config, today)
    orders.put_new(result.orders)  # idempotent: existing order ids are left untouched
    created = result.orders

    report = _report(today, account, quotes, config, result, created, expired)
    key = reports.put(today, report)
    email.send(*email.end_of_day(report))

    log.info("quant done: triggered=%s orders=%d report=%s", result.triggered, len(created), key)
    return {"status": "ok", "date": today, "triggered": result.triggered, "orders": len(created)}


def _report(today, account, quotes, config, result: RebalanceResult, created, expired) -> dict:
    holdings = []
    for ticker, h in sorted(account.holdings.items()):
        px = quotes[ticker].price
        holdings.append(
            {
                "ticker": ticker,
                "quantity": h.quantity,
                "avg_cost": h.avg_cost,
                "price": px,
                "value": money(h.quantity * px),
                "unrealized_pnl": money(h.quantity * (px - h.avg_cost)),
            }
        )
    closed = orders.list_closed_on(today)
    net_deposits = account.net_deposits if account.net_deposits is not None else Decimal(0)
    return {
        "date": today,
        "generated_at": clock.iso_now(),
        "total_value": result.total_value,
        "cash": money(account.cash),
        "net_deposits": money(net_deposits),
        "pnl": money(result.total_value - net_deposits),
        "drift_threshold_pct": config.drift_threshold_pct,
        "components": [
            {
                "name": c.name,
                "quantity": c.quantity,
                "price": c.price,
                "value": c.value,
                "target_pct": c.target_pct,
                "actual_pct": c.actual_pct,
                "drift_pct": c.drift_pct,
            }
            for c in result.components
        ],
        "rebalance_triggered": result.triggered,
        "orders_created": [
            {
                "ticker": o.ticker,
                "side": str(o.side),
                "quantity": o.quantity,
                "priority": o.priority,
            }
            for o in created
        ],
        "orders_closed_today": [
            {
                "order_id": o.order_id,
                "ticker": o.ticker,
                "side": str(o.side),
                "status": str(o.status),
                "filled_quantity": o.filled_quantity,
                "fill_price": o.fill_price,
                "reject_reason": o.reject_reason,
            }
            for o in sorted(closed, key=lambda o: o.order_id)
        ],
        "expired": expired,
        "holdings": holdings,
    }
