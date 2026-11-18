"""`orders` table: PK orderDate, SK orderId; GSI status-index (PK status, SK orderId)."""

import logging
from decimal import Decimal

from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

from src import clock
from src.config import settings
from src.models import Order, OrderStatus, Side
from src.store import dynamo

log = logging.getLogger(__name__)

STATUS_INDEX = "status-index"


def _table():
    return dynamo.table(settings().orders_table)


def _to_item(order: Order) -> dict:
    item = {
        "orderDate": order.order_date,
        "orderId": order.order_id,
        "ticker": order.ticker,
        "side": str(order.side),
        "quantity": order.quantity,
        "status": str(order.status),
        "priority": order.priority,
        "filledQuantity": order.filled_quantity,
        "fillPrice": order.fill_price,
        "createdAt": order.created_at,
        "sentAt": order.sent_at,
        "closedAt": order.closed_at,
        "rejectReason": order.reject_reason,
    }
    return {k: v for k, v in item.items() if v is not None}


def _from_item(item: dict) -> Order:
    def opt_int(name):
        return int(item[name]) if name in item else None

    return Order(
        order_date=item["orderDate"],
        ticker=item["ticker"],
        side=Side(item["side"]),
        quantity=int(item["quantity"]),
        status=OrderStatus(item["status"]),
        priority=opt_int("priority"),
        filled_quantity=opt_int("filledQuantity"),
        fill_price=Decimal(item["fillPrice"]) if "fillPrice" in item else None,
        created_at=item.get("createdAt"),
        sent_at=item.get("sentAt"),
        closed_at=item.get("closedAt"),
        reject_reason=item.get("rejectReason"),
    )


def _key(order: Order) -> dict:
    return {"orderDate": order.order_date, "orderId": order.order_id}


def put_new(orders: list[Order]) -> list[Order]:
    """Insert orders; an order whose id already exists is left untouched. Returns inserted ones."""
    inserted = []
    for order in orders:
        order.created_at = order.created_at or clock.iso_now()
        try:
            _table().put_item(
                Item=_to_item(order), ConditionExpression=Attr("orderId").not_exists()
            )
            inserted.append(order)
        except ClientError as err:
            if not dynamo.is_condition_failure(err):
                raise
            log.warning("order %s already exists; skipped", order.order_id)
    return inserted


def get(order_date: str, order_id: str) -> Order | None:
    item = _table().get_item(Key={"orderDate": order_date, "orderId": order_id}).get("Item")
    return _from_item(item) if item else None


def list_by_status(status: OrderStatus, side: Side | None = None) -> list[Order]:
    kwargs = {"IndexName": STATUS_INDEX, "KeyConditionExpression": Key("status").eq(str(status))}
    if side:
        kwargs["FilterExpression"] = Attr("side").eq(str(side))
    return [_from_item(i) for i in dynamo.query_all(_table(), **kwargs)]


def list_closed_on(day: str) -> list[Order]:
    """FILLED and REJECTED orders whose closedAt falls on `day` (YYYY-MM-DD)."""
    result = []
    for status in (OrderStatus.FILLED, OrderStatus.REJECTED):
        result += [
            _from_item(i)
            for i in dynamo.query_all(
                _table(),
                IndexName=STATUS_INDEX,
                KeyConditionExpression=Key("status").eq(str(status)),
                FilterExpression=Attr("closedAt").begins_with(day),
            )
        ]
    return result


def _transition(order: Order, expected: OrderStatus, updates: dict) -> bool:
    """Conditionally move an order out of `expected`. Returns False if it was not in that state."""
    names = {f"#{k}": k for k in updates}
    names["#status"] = "status"
    values = {f":{k}": v for k, v in updates.items()}
    values[":expected"] = str(expected)
    try:
        _table().update_item(
            Key=_key(order),
            UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in updates),
            ConditionExpression="#status = :expected",
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
        )
        return True
    except ClientError as err:
        if not dynamo.is_condition_failure(err):
            raise
        log.warning("order %s not %s; transition skipped", order.order_id, expected)
        return False


def mark_sent(order: Order, sent_at: str) -> bool:
    ok = _transition(
        order,
        OrderStatus.PENDING,
        {"status": str(OrderStatus.SENT), "sentAt": sent_at, "quantity": order.quantity},
    )
    if ok:
        order.status, order.sent_at = OrderStatus.SENT, sent_at
    return ok


def mark_rejected(order: Order, reason: str) -> bool:
    ok = _transition(
        order,
        order.status,
        {"status": str(OrderStatus.REJECTED), "rejectReason": reason, "closedAt": clock.iso_now()},
    )
    if ok:
        order.status, order.reject_reason = OrderStatus.REJECTED, reason
    return ok


def mark_expired(order: Order) -> bool:
    ok = _transition(
        order,
        OrderStatus.PENDING,
        {"status": str(OrderStatus.EXPIRED), "closedAt": clock.iso_now()},
    )
    if ok:
        order.status = OrderStatus.EXPIRED
    return ok


def fill_item(order: Order, filled_quantity: int, fill_price: Decimal, closed_at: str) -> dict:
    """Transaction item: SENT → FILLED."""
    return dynamo.update_item(
        settings().orders_table,
        _key(order),
        "SET #status = :filled, filledQuantity = :qty, fillPrice = :price, closedAt = :at",
        {
            ":filled": str(OrderStatus.FILLED),
            ":qty": filled_quantity,
            ":price": fill_price,
            ":at": closed_at,
            ":sent": str(OrderStatus.SENT),
        },
        names={"#status": "status"},
        condition="#status = :sent",
    )
