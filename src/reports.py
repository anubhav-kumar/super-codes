"""Daily run report → S3 (`reports/date=YYYY-MM-DD/report.json`)."""

import json
from decimal import Decimal
from functools import cache

import boto3

from src.config import settings


@cache
def _s3():
    return boto3.client("s3")


def _default(value):
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"not JSON serializable: {type(value).__name__}")


def to_json(report: dict) -> str:
    return json.dumps(report, default=_default, indent=2)


def put(day: str, report: dict) -> str:
    key = f"reports/date={day}/report.json"
    _s3().put_object(
        Bucket=settings().reports_bucket,
        Key=key,
        Body=to_json(report).encode(),
        ContentType="application/json",
    )
    return key
