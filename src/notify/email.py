"""SES email: plain text with aligned tables."""

import logging
from functools import cache

import boto3

from src.config import settings
from src.models import Order

log = logging.getLogger(__name__)


@cache
def _ses():
    return boto3.client("ses")


def send(subject: str, body: str) -> None:
    address = settings().notify_email
    _ses().send_email(
        Source=address,
        Destination={"ToAddresses": [address]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
        },
    )
    log.info("email sent: %s", subject)


def table(headers: list[str], rows: list[list]) -> str:
    if not rows:
        return "(none)"
    cells = [headers] + [["" if v is None else str(v) for v in row] for row in rows]
    widths = [max(len(row[i]) for row in cells) for i in range(len(headers))]

    def line(row):
        return "  ".join(cell.ljust(widths[i]) for i, cell in enumerate(row)).rstrip()

    return "\n".join(
        [line(cells[0]), line(["-" * w for w in widths])] + [line(r) for r in cells[1:]]
    )


def order_batch(day: str, side: str, sent: list[Order]) -> tuple[str, str]:
    subject = f"[algotrading] {day} {side} orders: {len(sent)} sent"
    body = "\n".join(
        [
            f"{side} market orders placed on {day} (paper trading).",
            "",
            table(
                ["Ticker", "Side", "Qty", "Priority"],
                [[o.ticker, o.side, o.quantity, o.priority] for o in sent],
            ),
        ]
    )
    return subject, body + "\n"


def end_of_day(report: dict) -> tuple[str, str]:
    day = report["date"]
    subject = (
        f"[algotrading] {day} EOD: value INR {report['total_value']}"
        f" | P&L INR {report['pnl']}" + (" | REBALANCE" if report["rebalance_triggered"] else "")
    )
    closed = report["orders_closed_today"]
    parts = [
        f"End of day summary for {day} (paper trading).",
        "",
        f"Total value : INR {report['total_value']}",
        f"Cash        : INR {report['cash']}",
        f"Net deposits: INR {report['net_deposits']}",
        f"P&L         : INR {report['pnl']}",
        "",
        "Fills and rejections today:",
        table(
            ["Ticker", "Side", "Status", "Qty", "Price", "Reason"],
            [
                [
                    o["ticker"],
                    o["side"],
                    o["status"],
                    o["filled_quantity"],
                    o["fill_price"],
                    o["reject_reason"],
                ]
                for o in closed
            ],
        ),
        "",
        f"Weights vs targets (drift threshold {report['drift_threshold_pct']} pts):",
        table(
            ["Component", "Qty", "Price", "Value", "Target %", "Actual %", "Drift"],
            [
                [
                    c["name"],
                    c["quantity"],
                    c["price"],
                    c["value"],
                    c["target_pct"],
                    c["actual_pct"],
                    c["drift_pct"],
                ]
                for c in report["components"]
            ],
        ),
        "",
        "Holdings:",
        table(
            ["Ticker", "Qty", "Avg cost", "Price", "Value", "Unrealized P&L"],
            [
                [
                    h["ticker"],
                    h["quantity"],
                    h["avg_cost"],
                    h["price"],
                    h["value"],
                    h["unrealized_pnl"],
                ]
                for h in report["holdings"]
            ],
        ),
        "",
    ]
    if report["rebalance_triggered"]:
        parts += [
            "Rebalance triggered. Orders for the next session:",
            table(
                ["Ticker", "Side", "Qty", "Priority"],
                [
                    [o["ticker"], o["side"], o["quantity"], o["priority"]]
                    for o in report["orders_created"]
                ],
            ),
        ]
    else:
        parts.append("No rebalance: all components within the drift threshold.")
    if report["expired"]:
        parts += ["", "Expired (never sent): " + ", ".join(report["expired"])]
    return subject, "\n".join(parts) + "\n"
