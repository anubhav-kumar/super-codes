"""`portfolio` table: PK accountId, SK `CASH` or `POS#<ticker>`.

CASH item: amount (available cash), netDeposits (total deposited, for P&L).
POS item: ticker, quantity, avgCost.
"""

from decimal import Decimal

from boto3.dynamodb.conditions import Key

from src.config import settings
from src.models import Account, Holding
from src.store import dynamo

CASH_SK = "CASH"
POS_PREFIX = "POS#"


def _name() -> str:
    return settings().portfolio_table


def read(account_id: str) -> Account | None:
    items = dynamo.query_all(
        dynamo.table(_name()), KeyConditionExpression=Key("accountId").eq(account_id)
    )
    cash_item = next((i for i in items if i["sk"] == CASH_SK), None)
    if cash_item is None:
        return None
    holdings = {
        i["ticker"]: Holding(
            ticker=i["ticker"], quantity=int(i["quantity"]), avg_cost=Decimal(i["avgCost"])
        )
        for i in items
        if i["sk"].startswith(POS_PREFIX)
    }
    return Account(
        cash=Decimal(cash_item["amount"]),
        holdings=holdings,
        net_deposits=Decimal(cash_item.get("netDeposits", 0)),
    )


def seed_cash_item(account_id: str, amount: Decimal) -> dict:
    return dynamo.put_item(
        _name(),
        {"accountId": account_id, "sk": CASH_SK, "amount": amount, "netDeposits": amount},
        condition="attribute_not_exists(sk)",
    )


def set_cash_item(account_id: str, old: Decimal, new: Decimal) -> dict:
    """Optimistic update: fails if cash changed since it was read."""
    return dynamo.update_item(
        _name(),
        {"accountId": account_id, "sk": CASH_SK},
        "SET #amount = :new",
        {":new": new, ":old": old},
        names={"#amount": "amount"},
        condition="#amount = :old",
    )


def deposit_item(account_id: str, old: Decimal, amount: Decimal) -> dict:
    """Optimistic update: adds `amount` to cash and to netDeposits."""
    return dynamo.update_item(
        _name(),
        {"accountId": account_id, "sk": CASH_SK},
        "SET #amount = :new, netDeposits = netDeposits + :amt",
        {":new": old + amount, ":old": old, ":amt": amount},
        names={"#amount": "amount"},
        condition="#amount = :old",
    )


def put_position_item(account_id: str, holding: Holding, previous_quantity: int | None) -> dict:
    item = {
        "accountId": account_id,
        "sk": POS_PREFIX + holding.ticker,
        "ticker": holding.ticker,
        "quantity": holding.quantity,
        "avgCost": holding.avg_cost,
    }
    if previous_quantity is None:
        return dynamo.put_item(_name(), item, condition="attribute_not_exists(sk)")
    return dynamo.put_item(
        _name(),
        item,
        condition="#quantity = :prev",
        names={"#quantity": "quantity"},
        values={":prev": previous_quantity},
    )


def delete_position_item(account_id: str, ticker: str, previous_quantity: int) -> dict:
    return dynamo.delete_item(
        _name(),
        {"accountId": account_id, "sk": POS_PREFIX + ticker},
        "#quantity = :prev",
        {":prev": previous_quantity},
        names={"#quantity": "quantity"},
    )
