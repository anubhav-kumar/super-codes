"""Manual deposit into the paper account (ARCHITECTURE.md §4.5).

Invoke: serverless invoke -f deposit --data '{"amount": 2000}'
"""

import logging
from decimal import Decimal

from src.config import settings

log = logging.getLogger(__name__)


def handler(event, context):
    if settings().broker != "paper":
        raise RuntimeError("deposits are only supported for the paper broker")
    from src.brokers.paper.broker import PaperBroker

    amount = Decimal(str(event["amount"]))
    account = PaperBroker().deposit(amount)
    return {"status": "ok", "deposited": str(amount), "cash": str(account.cash)}
