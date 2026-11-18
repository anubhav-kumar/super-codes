"""Transaction charges and capital gains tax for the backtest (rules in taxes_and_charges.md).

Charges (per trade, Zerodha equity delivery): STT by instrument type, exchange fee, SEBI fee,
IPFT, stamp duty (buy), GST on (brokerage + exchange + SEBI + IPFT), and a flat DP charge
per ticker per sell day.

Tax: lots are matched FIFO. STT is excluded from cost and sale value; all other charges are
included. A lot is long term if sold more than `long_term_after_months` after purchase.
Gains are netted per financial year (April–March):
- short-term losses offset any gains (highest tax rate first);
- long-term losses offset only long-term gains;
- unused losses carry forward (the 8-year expiry is not modelled);
- the equity LTCG exemption applies to net equity LTCG;
- cess is added on top. Surcharge and the 87A rebate are not modelled.
"""

import json
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path

from src.models import money

COSTS_PATH = Path(__file__).resolve().parent / "costs.json"
CRORE = Decimal(10_000_000)
HUNDRED = Decimal(100)

# Gain buckets: (term, rate key)
ST_SPECIAL = "st_special"  # equity STCG at the special rate
ST_SLAB = "st_slab"  # STCG taxed at slab (non-equity, debt)
LT_EQUITY = "lt_equity"  # equity LTCG (exemption applies)
LT_OTHER = "lt_other"  # other LTCG
BUCKETS = (ST_SPECIAL, ST_SLAB, LT_EQUITY, LT_OTHER)
LONG_TERM = {LT_EQUITY, LT_OTHER}
EQUITY_CATEGORY = "EQUITY"


def financial_year(day: date) -> int:
    """FY start year: 2025 means 2025-04-01 to 2026-03-31."""
    return day.year if day.month >= 4 else day.year - 1


def _add_months(day: date, months: int) -> date:
    month = day.month - 1 + months
    year = day.year + month // 12
    month = month % 12 + 1
    for d in (day.day, 30, 29, 28):
        try:
            return date(year, month, d)
        except ValueError:
            continue
    raise ValueError(day)


def _dec(value) -> Decimal:
    return Decimal(str(value))


@dataclass(frozen=True)
class TradeCost:
    total: Decimal  # every charge, including STT (cash impact)
    stt: Decimal


class CostModel:
    def __init__(self, path: Path = COSTS_PATH, charges: bool = True, taxes: bool = True):
        raw = json.loads(path.read_text())
        self.charges_on = charges
        self.taxes_on = taxes
        c = raw["charges"]
        self.brokerage = _dec(c["brokerage_per_order"])
        self.exchange = _dec(c["exchange_pct"]) / HUNDRED
        self.sebi = _dec(c["sebi_per_crore"]) / CRORE
        self.ipft = _dec(c["ipft_per_crore"]) / CRORE
        self.stamp = _dec(c["stamp_buy_pct"]) / HUNDRED
        self.gst = _dec(c["gst_pct"]) / HUNDRED
        self.dp = _dec(c["dp_per_scrip_sell_day"])
        self.stt = {
            kind: {side: _dec(v) / HUNDRED for side, v in sides.items()}
            for kind, sides in raw["stt_pct"].items()
        }
        t = raw["tax"]
        self.slab = _dec(t["slab_rate_pct"]) / HUNDRED
        self.cess = _dec(t["cess_pct"]) / HUNDRED
        self.ltcg_exemption = _dec(t["ltcg_equity_exemption"])
        self.categories = t["categories"]
        self.instruments = raw["instruments"]
        self.rates = {
            ST_SPECIAL: self._rate(self.categories["EQUITY"]["stcg_pct"]),
            ST_SLAB: self.slab,
            LT_EQUITY: self._rate(self.categories["EQUITY"]["ltcg_pct"]),
            LT_OTHER: self._rate(self.categories["NON_EQUITY"]["ltcg_pct"]),
        }

    def check(self, tickers: list[str]) -> None:
        missing = [t for t in tickers if t not in self.instruments]
        if missing:
            raise SystemExit(f"backtest/costs.json has no instrument entry for {missing}")

    def _rate(self, value) -> Decimal:
        return self.slab if value == "slab" else _dec(value) / HUNDRED

    def bucket_rate(self, bucket: str) -> Decimal:
        return self.rates[bucket]

    def trade_cost(self, ticker: str, side: str, value: Decimal) -> TradeCost:
        """Charges for one order (DP charge excluded; see dp_charge)."""
        if not self.charges_on:
            return TradeCost(Decimal(0), Decimal(0))
        kind = self.instruments[ticker]["type"]
        stt = value * self.stt[kind][side.lower()]
        exchange = value * self.exchange
        sebi = value * self.sebi
        ipft = value * self.ipft
        stamp = value * self.stamp if side == "BUY" else Decimal(0)
        gst = (self.brokerage + exchange + sebi + ipft) * self.gst
        total = self.brokerage + stt + exchange + sebi + ipft + stamp + gst
        return TradeCost(total=money(total), stt=money(stt))

    def dp_charge(self) -> Decimal:
        return self.dp if self.charges_on else Decimal(0)

    def buy_cost_factor(self, ticker: str) -> Decimal:
        """Approximate charges per rupee bought, for sizing BUYs within available cash."""
        if not self.charges_on:
            return Decimal(0)
        kind = self.instruments[ticker]["type"]
        return (
            self.stt[kind]["buy"]
            + self.stamp
            + (self.exchange + self.sebi + self.ipft) * (1 + self.gst)
            + Decimal("0.0001")
        )

    def classify(self, ticker: str, buy_day: date, sell_day: date) -> str:
        category = self.instruments[ticker]["tax"]
        rule = self.categories[category]
        months = rule["long_term_after_months"]
        long_term = months is not None and sell_day > _add_months(buy_day, months)
        if long_term:
            return LT_EQUITY if category == "EQUITY" else LT_OTHER
        return ST_SPECIAL if rule["stcg_pct"] != "slab" else ST_SLAB


@dataclass
class Lot:
    day: date
    quantity: int
    cost_per_unit: Decimal  # includes buy-side charges except STT


class TaxBook:
    """FIFO lots, realized gains per financial year, and tax computation."""

    def __init__(self, model: CostModel):
        self.model = model
        self.lots: dict[str, deque[Lot]] = defaultdict(deque)
        self.gains: dict[int, dict[str, Decimal]] = defaultdict(
            lambda: {b: Decimal(0) for b in BUCKETS}
        )
        self.carry_st = Decimal(0)
        self.carry_lt = Decimal(0)

    def buy(self, ticker: str, day: date, quantity: int, cost_basis: Decimal) -> None:
        self.lots[ticker].append(Lot(day, quantity, cost_basis / quantity))

    def sell(self, ticker: str, day: date, quantity: int, net_proceeds: Decimal) -> None:
        per_unit = net_proceeds / quantity
        remaining = quantity
        fy = financial_year(day)
        while remaining > 0:
            lot = self.lots[ticker][0]
            used = min(remaining, lot.quantity)
            bucket = self.model.classify(ticker, lot.day, day)
            self.gains[fy][bucket] += used * (per_unit - lot.cost_per_unit)
            lot.quantity -= used
            remaining -= used
            if lot.quantity == 0:
                self.lots[ticker].popleft()

    def close_year(self, fy: int) -> Decimal:
        """Tax for financial year `fy` (with set-off and carry-forward). Call once per year."""
        if not self.model.taxes_on:
            return Decimal(0)
        net = dict(self.gains.pop(fy, {b: Decimal(0) for b in BUCKETS}))
        st_loss = self.carry_st + sum(
            (-net[b] for b in (ST_SPECIAL, ST_SLAB) if net[b] < 0), Decimal(0)
        )
        lt_loss = self.carry_lt + sum((-net[b] for b in LONG_TERM if net[b] < 0), Decimal(0))
        for b in BUCKETS:
            net[b] = max(net[b], Decimal(0))

        # Long-term losses: only against long-term gains (non-exempt bucket first).
        for b in (LT_OTHER, LT_EQUITY):
            used = min(lt_loss, net[b])
            net[b] -= used
            lt_loss -= used
        # Short-term losses: against any gains, highest rate first.
        for b in sorted(BUCKETS, key=self.model.bucket_rate, reverse=True):
            used = min(st_loss, net[b])
            net[b] -= used
            st_loss -= used
        self.carry_st, self.carry_lt = st_loss, lt_loss

        net[LT_EQUITY] = max(net[LT_EQUITY] - self.model.ltcg_exemption, Decimal(0))
        tax = sum((net[b] * self.model.bucket_rate(b) for b in BUCKETS), Decimal(0))
        return money(tax * (1 + self.model.cess))


# ---------------------------------------------------------------- harvesting helpers


def fifo_prefix(book: TaxBook, ticker: str, unit_price: Decimal, day: date):
    """Selling units of `ticker` FIFO at `unit_price` on `day`: for each lot boundary, yield
    (units sold so far, cumulative gain, every unit so far long-term?, per-unit gain of lot,
    lot quantity)."""
    units, gain, all_long = 0, Decimal(0), True
    for lot in book.lots[ticker]:
        bucket = book.model.classify(ticker, lot.day, day)
        per_unit = unit_price - lot.cost_per_unit
        all_long = all_long and bucket in LONG_TERM
        yield units, gain, all_long, per_unit, lot.quantity, bucket
        units += lot.quantity
        gain += per_unit * lot.quantity


def realized_this_year(book: TaxBook, day: date, bucket: str) -> Decimal:
    return book.gains.get(financial_year(day), {}).get(bucket, Decimal(0))
