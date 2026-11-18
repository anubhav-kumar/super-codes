"""Historical daily prices (split- and dividend-adjusted) with a local JSON cache.

yfinance returns pandas DataFrames; they are converted to plain `DailyBar`s immediately.
"""

import json
import math
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path

import yfinance as yf

from src.models import price

DATA_DIR = Path(__file__).resolve().parent / "data"
HISTORY_START = "2000-01-01"


@dataclass(frozen=True)
class DailyBar:
    day: date
    open: Decimal
    close: Decimal


def _valid(value) -> bool:
    return value is not None and not (isinstance(value, float) and math.isnan(value)) and value > 0


def _download(ticker: str, dividends: bool) -> list[dict]:
    # auto_adjust=True: split + dividend adjusted. False: split-adjusted only (futures proxy).
    frame = yf.Ticker(ticker).history(start=HISTORY_START, interval="1d", auto_adjust=dividends)
    if frame is None or len(frame) == 0:
        raise RuntimeError(f"no history for {ticker}")
    days = [ts.date().isoformat() for ts in frame.index.to_pydatetime()]
    rows = []
    for day, o, c in zip(days, frame["Open"].tolist(), frame["Close"].tolist(), strict=True):
        if _valid(o) and _valid(c):
            rows.append({"day": day, "open": str(o), "close": str(c)})
    return rows


def load(ticker: str, refresh: bool = False, dividends: bool = True) -> list[DailyBar]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / (f"{ticker}.json" if dividends else f"{ticker}.splitadj.json")
    if refresh or not path.exists():
        path.write_text(json.dumps(_download(ticker, dividends)))
    bars = [
        DailyBar(
            day=date.fromisoformat(r["day"]),
            open=price(Decimal(r["open"])),
            close=price(Decimal(r["close"])),
        )
        for r in json.loads(path.read_text())
    ]
    return _drop_glitches(ticker, bars)


GLITCH_BAND = Decimal("0.35")  # NSE price bands keep genuine daily moves well inside ±35%
GLITCH_MAX_RUN = 5


def _outside(bar: DailyBar, ref: Decimal) -> bool:
    return any(abs(v / ref - 1) > GLITCH_BAND for v in (bar.open, bar.close))


def _drop_glitches(ticker: str, bars: list[DailyBar]) -> list[DailyBar]:
    """Drop short runs of bad bars (e.g. a missed split adjustment) that revert to the prior level.

    A run of up to GLITCH_MAX_RUN bars whose open/close sit outside ±35% of the last good close
    is dropped if the next bar is back within the band. A jump that does not revert is kept and
    reported, since it may be a genuine (unadjusted) level change.
    """
    kept: list[DailyBar] = []
    i = 0
    while i < len(bars):
        if not kept or not _outside(bars[i], kept[-1].close):
            kept.append(bars[i])
            i += 1
            continue
        ref = kept[-1].close
        run_end = next(
            (
                j
                for j in range(i + 1, min(i + GLITCH_MAX_RUN + 1, len(bars)))
                if not _outside(bars[j], ref)
            ),
            None,
        )
        if run_end is None:
            print(f"WARNING {ticker}: unreverted jump on {bars[i].day} kept; check the data")
            kept.append(bars[i])
            i += 1
            continue
        dropped = ", ".join(b.day.isoformat() for b in bars[i:run_end])
        print(f"{ticker}: dropped glitch bars {dropped}")
        i = run_end
    return kept
