"""Broker Lambda (ARCHITECTURE.md §4.4): consumes the SQS `orders` queue.

Uses partial batch responses: a failed message is retried by SQS after the visibility
timeout, and lands in the DLQ after the configured number of receives.
"""

import json
import logging
from decimal import ROUND_FLOOR, Decimal

from src.brokers.base import Broker, RetryableError
from src.brokers.factory import get_broker
from src.config import settings
from src.models import Order, OrderStatus, Side
from src.store import orders

log = logging.getLogger(__name__)


def handler(event, context):
    failures = []
    for record in event.get("Records", []):
        try:
            process(json.loads(record["body"]))
        except RetryableError as err:
            log.info("retry later: %s", err)
            failures.append({"itemIdentifier": record["messageId"]})
        except Exception:
            log.exception("failed to process message %s", record["messageId"])
            failures.append({"itemIdentifier": record["messageId"]})
    return {"batchItemFailures": failures}


def process(message: dict) -> None:
    side = Side(message["side"])
    batch = []
    for key in message["orders"]:
        order = orders.get(key["orderDate"], key["orderId"])
        if order and order.status == OrderStatus.PENDING:
            batch.append(order)
    if not batch:
        log.info("no PENDING orders left in %s batch", side)
        return

    broker = get_broker()
    sendable = _sell_guard(broker, batch) if side == Side.SELL else _buy_guard(broker, batch)
    broker.send_orders(sendable)
    log.info("sent %d %s orders", len(sendable), side)


def _sell_guard(broker: Broker, batch: list[Order]) -> list[Order]:
    """Holding guard: never sell more than is held."""
    account = broker.get_account()
    sendable = []
    for order in batch:
        held = account.quantity(order.ticker)
        if held == 0:
            orders.mark_rejected(order, "holding guard: nothing held")
            continue
        order.quantity = min(order.quantity, held)
        sendable.append(order)
    return sendable


def _buy_guard(broker: Broker, batch: list[Order]) -> list[Order]:
    """Wait for SELLs to fill, then fit BUYs into actual cash by priority."""
    account = broker.get_account()
    waiting = orders.list_by_status(OrderStatus.SENT, Side.SELL)
    if waiting:
        raise RetryableError(f"{len(waiting)} SELL orders not filled yet")

    quotes = broker.get_quotes(sorted({o.ticker for o in batch}))
    buffer = 1 + settings().cash_guard_buffer_pct / Decimal(100)
    remaining = account.cash
    sendable = []
    for order in sorted(batch, key=lambda o: (o.priority is None, o.priority or 0)):
        estimate = quotes[order.ticker].price * buffer
        affordable = int((remaining / estimate).to_integral_value(ROUND_FLOOR))
        quantity = min(order.quantity, affordable)
        if quantity == 0:
            orders.mark_rejected(order, "cash guard: insufficient cash")
            continue
        order.quantity = quantity
        remaining -= quantity * estimate
        sendable.append(order)
    return sendable
