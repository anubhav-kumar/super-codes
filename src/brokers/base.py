from abc import ABC, abstractmethod

from src.models import Account, Order, Quote


class RetryableError(Exception):
    """The operation cannot complete yet (e.g. a price is not published); retry later."""


class Broker(ABC):
    @abstractmethod
    def get_account(self) -> Account:
        """Available cash and holdings."""

    @abstractmethod
    def get_quotes(self, tickers: list[str]) -> dict[str, Quote]:
        """Latest price and its trading date per ticker."""

    @abstractmethod
    def send_orders(self, orders: list[Order]) -> None:
        """Place a batch of orders. Orders must be PENDING; on success they become SENT."""
