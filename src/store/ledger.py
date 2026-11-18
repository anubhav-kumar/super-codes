"""`ledger` table: PK accountId, SK `<ISO timestamp>#<ref>`. Append-only."""

from decimal import Decimal

from src.config import settings
from src.store import dynamo


def entry_item(
    account_id: str,
    timestamp: str,
    ref: str,
    entry_type: str,
    cash_delta: Decimal,
    cash_after: Decimal,
    **details,
) -> dict:
    item = {
        "accountId": account_id,
        "sk": f"{timestamp}#{ref}",
        "type": entry_type,
        "timestamp": timestamp,
        "cashDelta": cash_delta,
        "cashAfter": cash_after,
        **{k: v for k, v in details.items() if v is not None},
    }
    return dynamo.put_item(
        settings().ledger_table,
        item,
        condition="attribute_not_exists(sk)",
    )
