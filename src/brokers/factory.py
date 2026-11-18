from src.brokers.base import Broker
from src.config import settings


def get_broker() -> Broker:
    name = settings().broker
    if name == "paper":
        from src.brokers.paper.broker import PaperBroker

        return PaperBroker()
    raise ValueError(f"unknown broker {name!r}")
