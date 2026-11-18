from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30), name="IST")


def now() -> datetime:
    return datetime.now(IST)


def today() -> date:
    return now().date()


def iso_now() -> str:
    return now().isoformat(timespec="seconds")
