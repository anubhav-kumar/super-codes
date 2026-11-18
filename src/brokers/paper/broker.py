"""Paper broker (ARCHITECTURE.md §4.2, §6).

Cash and holdings live in DynamoDB. SENT orders are settled lazily, whenever the account is read:
- SELL fills at the open of the first session on/after the send date, minus slippage.
- BUY fills at the open of the first 5-minute bar at/after the send time, plus slippage.
Each fill is one DynamoDB transaction (order + cash + position + ledger), guarded by
conditions so a fill can never be applied twice.
"""

import logging
import uuid
from datetime import datetime, time
from decimal import ROUND_FLOOR, Decimal

from src import clock
from src.brokers.base import Broker, RetryableError
from src.brokers.paper import prices
from src.config import settings
from src.models import Account, Holding, Order, OrderStatus, Quote, Side, money, price
from src.notify import email
from src.store import dynamo, ledger, orders, portfolio

log = logging.getLogger(__name__)

MARKET_OPEN = time(9, 15, tzinfo=clock.IST)


class PaperBroker(Broker):
    def __init__(self) -> None:
        cfg = settings()
        self.account_id = cfg.account_id
        self.initial_cash = money(cfg.paper_initial_cash)
        self.slippage = cfg.paper_slippage_pct / Decimal(100)

    # ---- Broker interface -------------------------------------------------------------

    def get_account(self) -> Account:
        self._ensure_seeded()
        self.settle()
        return portfolio.read(self.account_id)

    def get_quotes(self, tickers: list[str]) -> dict[str, Quote]:
        quotes = {}
        for ticker in tickers:
            quote = prices.latest_quote(ticker)
            if quote is None:
                raise RetryableError(f"no price available for {ticker}")
            quotes[ticker] = quote
        return quotes

    def send_orders(self, batch: list[Order]) -> None:
        if not batch:
            return
        sides = {o.side for o in batch}
        side = str(next(iter(sides))) if len(sides) == 1 else "MIXED"
        subject, body = email.order_batch(clock.today().isoformat(), side, batch)
        email.send(subject, body)
        sent_at = clock.iso_now()
        for order in batch:
            orders.mark_sent(order, sent_at)

    # ---- Paper-only operations ----------------------------------------------------------

    def deposit(self, amount: Decimal) -> Account:
        amount = money(amount)
        if amount <= 0:
            raise ValueError("deposit amount must be positive")
        self._ensure_seeded()
        account = portfolio.read(self.account_id)
        now = clock.iso_now()
        dynamo.transact(
            [
                portfolio.deposit_item(self.account_id, account.cash, amount),
                ledger.entry_item(
                    self.account_id,
                    now,
                    f"DEPOSIT-{uuid.uuid4().hex[:8]}",
                    "DEPOSIT",
                    cash_delta=amount,
                    cash_after=account.cash + amount,
                ),
            ]
        )
        log.info("deposited INR %s", amount)
        return portfolio.read(self.account_id)

    def settle(self) -> list[Order]:
        """Settle every SENT order whose fill price is available. Returns those still SENT."""
        sent = orders.list_by_status(OrderStatus.SENT)
        sent.sort(key=lambda o: (o.side != Side.SELL, o.sent_at or "", o.ticker))
        unsettled = []
        for order in sent:
            if not self._settle_one(order):
                unsettled.append(order)
        return unsettled

    # ---- internals ----------------------------------------------------------------------

    def _ensure_seeded(self) -> None:
        if portfolio.read(self.account_id) is not None:
            return
        now = clock.iso_now()
        try:
            dynamo.transact(
                [
                    portfolio.seed_cash_item(self.account_id, self.initial_cash),
                    ledger.entry_item(
                        self.account_id,
                        now,
                        "INITIAL",
                        "DEPOSIT",
                        cash_delta=self.initial_cash,
                        cash_after=self.initial_cash,
                    ),
                ]
            )
            log.info("seeded paper account with INR %s", self.initial_cash)
        except dynamo.ConditionFailed:
            log.info("paper account already seeded")

    def _fill_price(self, order: Order) -> tuple[datetime, Decimal] | None:
        sent_at = datetime.fromisoformat(order.sent_at)
        if order.side == Side.SELL:
            found = prices.session_open_on_or_after(order.ticker, sent_at.date())
            if found is None:
                return None
            day, base = found
            return datetime.combine(day, MARKET_OPEN), price(base * (1 - self.slippage))
        found = prices.intraday_open_at_or_after(order.ticker, sent_at)
        if found is None:
            return None
        at, base = found
        return at, price(base * (1 + self.slippage))

    def _settle_one(self, order: Order) -> bool:
        fill = self._fill_price(order)
        if fill is None:
            log.info("no fill price yet for %s", order.order_id)
            return False
        filled_at, fill_price = fill

        account = portfolio.read(self.account_id)
        held = account.holdings.get(order.ticker)
        held_qty = held.quantity if held else 0

        if order.side == Side.SELL:
            quantity = min(order.quantity, held_qty)
            if quantity == 0:
                return orders.mark_rejected(order, "holding guard: nothing held at fill")
            cash_delta = money(quantity * fill_price)
            new_qty = held_qty - quantity
            position_op = (
                portfolio.delete_position_item(self.account_id, order.ticker, held_qty)
                if new_qty == 0
                else portfolio.put_position_item(
                    self.account_id, Holding(order.ticker, new_qty, held.avg_cost), held_qty
                )
            )
        else:
            affordable = int((account.cash / fill_price).to_integral_value(ROUND_FLOOR))
            quantity = min(order.quantity, affordable)
            if quantity == 0:
                return orders.mark_rejected(order, "cash guard: insufficient cash at fill")
            cash_delta = -money(quantity * fill_price)
            new_qty = held_qty + quantity
            old_cost = held.avg_cost * held_qty if held else Decimal(0)
            avg_cost = price((old_cost + quantity * fill_price) / new_qty)
            position_op = portfolio.put_position_item(
                self.account_id,
                Holding(order.ticker, new_qty, avg_cost),
                held_qty if held else None,
            )

        new_cash = account.cash + cash_delta
        try:
            dynamo.transact(
                [
                    orders.fill_item(order, quantity, fill_price, clock.iso_now()),
                    portfolio.set_cash_item(self.account_id, account.cash, new_cash),
                    position_op,
                    ledger.entry_item(
                        self.account_id,
                        filled_at.isoformat(timespec="seconds"),
                        order.order_id,
                        "FILL",
                        cash_delta=cash_delta,
                        cash_after=new_cash,
                        ticker=order.ticker,
                        side=str(order.side),
                        quantity=quantity,
                        price=fill_price,
                    ),
                ]
            )
        except dynamo.ConditionFailed:
            log.warning(
                "fill of %s conflicted with a concurrent change; will retry", order.order_id
            )
            return False
        log.info("filled %s: %s @ %s", order.order_id, quantity, fill_price)
        return True
