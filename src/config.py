import json
import os
from dataclasses import dataclass
from decimal import Decimal
from functools import cache
from pathlib import Path

from src.models import CASH

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PORTFOLIO_PATH = PROJECT_ROOT / "config" / "portfolio.json"


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class PortfolioConfig:
    drift_threshold_pct: Decimal
    targets: dict[str, Decimal]

    @property
    def tickers(self) -> list[str]:
        return [name for name in self.targets if name != CASH]

    def target(self, name: str) -> Decimal:
        return self.targets.get(name, Decimal(0))


@dataclass(frozen=True)
class Settings:
    broker: str
    account_id: str
    orders_table: str
    portfolio_table: str
    ledger_table: str
    reports_bucket: str
    orders_queue_url: str
    notify_email: str
    paper_initial_cash: Decimal
    paper_slippage_pct: Decimal
    cash_guard_buffer_pct: Decimal


def load_portfolio_config(path: Path | None = None) -> PortfolioConfig:
    path = path or Path(os.environ.get("PORTFOLIO_CONFIG_PATH", DEFAULT_PORTFOLIO_PATH))
    raw = json.loads(path.read_text(), parse_float=Decimal, parse_int=Decimal)

    threshold = raw.get("drift_threshold_pct")
    if not isinstance(threshold, Decimal) or threshold <= 0:
        raise ConfigError("drift_threshold_pct must be a positive number")

    targets = raw.get("targets")
    if not isinstance(targets, dict) or not targets:
        raise ConfigError("targets must be a non-empty object")
    for name, pct in targets.items():
        if not isinstance(name, str) or not name.strip():
            raise ConfigError("target names must be non-empty strings")
        if not isinstance(pct, Decimal) or pct < 0:
            raise ConfigError(f"target for {name} must be a non-negative number")

    total = sum(targets.values(), Decimal(0))
    if total != 100:
        raise ConfigError(f"targets must sum to 100, got {total}")

    return PortfolioConfig(drift_threshold_pct=threshold, targets=dict(targets))


def _env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None or value == "":
        raise ConfigError(f"missing environment variable {name}")
    return value


@cache
def settings() -> Settings:
    return Settings(
        broker=_env("BROKER", "paper"),
        account_id=_env("ACCOUNT_ID", "paper"),
        orders_table=_env("ORDERS_TABLE"),
        portfolio_table=_env("PORTFOLIO_TABLE"),
        ledger_table=_env("LEDGER_TABLE"),
        reports_bucket=_env("REPORTS_BUCKET"),
        orders_queue_url=_env("ORDERS_QUEUE_URL"),
        notify_email=_env("NOTIFY_EMAIL"),
        paper_initial_cash=Decimal(_env("PAPER_INITIAL_CASH", "5000")),
        paper_slippage_pct=Decimal(_env("PAPER_SLIPPAGE_PCT", "0.05")),
        cash_guard_buffer_pct=Decimal(_env("CASH_GUARD_BUFFER_PCT", "0.5")),
    )
