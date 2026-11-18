"""Shared DynamoDB access: table handles and multi-table transactions."""

from functools import cache
from typing import Any

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

_serializer = TypeSerializer()


class ConditionFailed(Exception):
    """A conditional write or transaction condition did not hold."""


@cache
def _resource():
    return boto3.resource("dynamodb")


@cache
def _client():
    # Plain client (not resource.meta.client): transactions take explicitly typed values.
    return boto3.client("dynamodb")


def table(name: str):
    return _resource().Table(name)


def _serialize(values: dict[str, Any]) -> dict[str, Any]:
    return {k: _serializer.serialize(v) for k, v in values.items()}


def put_item(
    table_name: str,
    item: dict,
    condition: str | None = None,
    names: dict | None = None,
    values: dict | None = None,
) -> dict:
    op = {"TableName": table_name, "Item": _serialize(item)}
    if condition:
        op["ConditionExpression"] = condition
    if names:
        op["ExpressionAttributeNames"] = names
    if values:
        op["ExpressionAttributeValues"] = _serialize(values)
    return {"Put": op}


def update_item(
    table_name: str,
    key: dict,
    update: str,
    values: dict,
    names: dict | None = None,
    condition: str | None = None,
) -> dict:
    op = {
        "TableName": table_name,
        "Key": _serialize(key),
        "UpdateExpression": update,
        "ExpressionAttributeValues": _serialize(values),
    }
    if names:
        op["ExpressionAttributeNames"] = names
    if condition:
        op["ConditionExpression"] = condition
    return {"Update": op}


def delete_item(
    table_name: str, key: dict, condition: str, values: dict, names: dict | None = None
) -> dict:
    op = {
        "TableName": table_name,
        "Key": _serialize(key),
        "ConditionExpression": condition,
        "ExpressionAttributeValues": _serialize(values),
    }
    if names:
        op["ExpressionAttributeNames"] = names
    return {"Delete": op}


def transact(items: list[dict]) -> None:
    try:
        _client().transact_write_items(TransactItems=items)
    except ClientError as err:
        if err.response["Error"]["Code"] in (
            "TransactionCanceledException",
            "ConditionalCheckFailedException",
        ):
            raise ConditionFailed(str(err)) from err
        raise


def is_condition_failure(err: ClientError) -> bool:
    return err.response["Error"]["Code"] == "ConditionalCheckFailedException"


def query_all(tbl, **kwargs) -> list[dict]:
    items: list[dict] = []
    while True:
        page = tbl.query(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            return items
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
