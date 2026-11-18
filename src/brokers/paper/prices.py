"""Yahoo Finance price source for the paper broker. The only module that imports yfinance.

yfinance returns pandas DataFrames; they are converted to plain `Bar` tuples immediately.
"""

import logging
import math
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

import yfinance as yf

from src.clock import IST
from src.models import Quote, price

log = logging.getLogger(__name__)

yf.set_tz_cache_location("/tmp/yfinance-cache")


@dataclass(frozen=True)
class Bar:
    start: datetime
    open: Decimal | None
    close: Decimal | None


def _decimal(value) -> Decimal | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    return price(Decimal(str(value)))


def _bars(ticker: str, period: str, interval: str) -> list[Bar]:
    frame = yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=False)
    if frame is None or len(frame) == 0:
        return []
    starts = [ts.astimezone(IST) for ts in frame.index.to_pydatetime()]
    opens = frame["Open"].tolist()
    closes = frame["Close"].tolist()
    return [Bar(s, _decimal(o), _decimal(c)) for s, o, c in zip(starts, opens, closes, strict=True)]


def latest_quote(ticker: str) -> Quote | None:
    bars = [b for b in _bars(ticker, "5d", "1d") if b.close is not None]
    if not bars:
        return None
    last = bars[-1]
    return Quote(ticker=ticker, price=last.close, date=last.start.date())


def session_open_on_or_after(ticker: str, day: date) -> tuple[date, Decimal] | None:
    """Open of the first daily session on or after `day`."""
    for bar in _bars(ticker, "1mo", "1d"):
        if bar.start.date() >= day and bar.open is not None:
            return bar.start.date(), bar.open
    return None


def intraday_open_at_or_after(ticker: str, moment: datetime) -> tuple[datetime, Decimal] | None:
    """Open of the first 5-minute bar that starts at or after the bar containing `moment`."""
    floor = moment.astimezone(IST).replace(second=0, microsecond=0)
    floor = floor.replace(minute=floor.minute - floor.minute % 5)
    for bar in _bars(ticker, "1mo", "5m"):
        if bar.start >= floor and bar.open is not None:
            return bar.start, bar.open
    return None
