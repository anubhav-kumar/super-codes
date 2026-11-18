"""Executor (ARCHITECTURE.md §4.4). Scheduled at 09:00 IST (SELL) and 09:30 IST (BUY).

Event: {"side": "SELL" | "BUY"}
"""

import json
import logging
from functools import cache

import boto3

from src.config import settings
from src.models import OrderStatus, Side
from src.store import orders

log = logging.getLogger(__name__)


@cache
def _sqs():
    return boto3.client("sqs")


def handler(event, context):
    side = Side(event["side"])
    pending = orders.list_by_status(OrderStatus.PENDING, side)
    if not pending:
        log.info("no PENDING %s orders", side)
        return {"status": "nothing-to-do", "side": str(side)}

    message = {
        "side": str(side),
        "orders": [{"orderDate": o.order_date, "orderId": o.order_id} for o in pending],
    }
    _sqs().send_message(QueueUrl=settings().orders_queue_url, MessageBody=json.dumps(message))
    log.info("published %s batch of %d orders", side, len(pending))
    return {"status": "published", "side": str(side), "orders": len(pending)}
