from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

CASH = "CASH"

MONEY_PLACES = Decimal("0.01")
PRICE_PLACES = Decimal("0.0001")


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_PLACES, rounding=ROUND_HALF_UP)


def price(value: Decimal) -> Decimal:
    return value.quantize(PRICE_PLACES, rounding=ROUND_HALF_UP)


class Side(StrEnum):
    BUY = "BUY"
    SELL = "SELL"


class OrderStatus(StrEnum):
    PENDING = "PENDING"
    SENT = "SENT"
    FILLED = "FILLED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


@dataclass
class Order:
    order_date: str
    ticker: str
    side: Side
    quantity: int
    status: OrderStatus = OrderStatus.PENDING
    priority: int | None = None
    filled_quantity: int | None = None
    fill_price: Decimal | None = None
    created_at: str | None = None
    sent_at: str | None = None
    closed_at: str | None = None
    reject_reason: str | None = None

    @property
    def order_id(self) -> str:
        return f"{self.order_date}#{self.ticker}#{self.side}"


@dataclass
class Holding:
    ticker: str
    quantity: int
    avg_cost: Decimal


@dataclass
class Account:
    cash: Decimal
    holdings: dict[str, Holding] = field(default_factory=dict)
    net_deposits: Decimal | None = None

    def quantity(self, ticker: str) -> int:
        holding = self.holdings.get(ticker)
        return holding.quantity if holding else 0


@dataclass
class Quote:
    ticker: str
    price: Decimal
    date: date
