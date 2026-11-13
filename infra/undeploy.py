"""Delete every file in the LibreChat bucket, then delete the stack and the bucket.

Run with Granted credentials, from the repo root:
    assume <profile>
    infra/venv/bin/python infra/undeploy.py

This permanently deletes all uploaded files. You are asked to type the bucket name to confirm
(skip the prompt with --yes). .env is not changed: remove AWS_BUCKET_NAME and set
fileStrategy back to "local" in librechat.yaml before starting LibreChat again.
"""

from __future__ import annotations

import argparse
import sys

import boto3
from botocore.exceptions import ClientError

DEFAULT_STACK = "librechat-files"


def bucket_of(cfn, name: str) -> str | None:
    try:
        resource = cfn.describe_stack_resource(StackName=name, LogicalResourceId="FilesBucket")
    except ClientError as err:
        if "does not exist" in str(err):
            return None
        raise
    return resource["StackResourceDetail"].get("PhysicalResourceId")


def empty_bucket(s3, bucket: str) -> int:
    deleted = 0
    try:
        for upload_page in s3.get_paginator("list_multipart_uploads").paginate(Bucket=bucket):
            for upload in upload_page.get("Uploads", []):
                s3.abort_multipart_upload(Bucket=bucket, Key=upload["Key"], UploadId=upload["UploadId"])
        for page in s3.get_paginator("list_object_versions").paginate(Bucket=bucket):
            objects = [
                {"Key": item["Key"], "VersionId": item["VersionId"]}
                for item in page.get("Versions", []) + page.get("DeleteMarkers", [])
            ]
            if not objects:
                continue
            response = s3.delete_objects(Bucket=bucket, Delete={"Objects": objects, "Quiet": True})
            errors = response.get("Errors", [])
            if errors:
                sys.exit(f"Could not delete {len(errors)} objects, e.g. {errors[0]}")
            deleted += len(objects)
    except ClientError as err:
        if err.response["Error"]["Code"] == "NoSuchBucket":
            return 0
        raise
    return deleted


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--stack-name", default=DEFAULT_STACK)
    parser.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    args = parser.parse_args()

    session = boto3.Session()
    if not session.region_name:
        sys.exit("No AWS region in the session. Run `assume <profile>` (the profile must set a region).")
    cfn = session.client("cloudformation")

    try:
        cfn.describe_stacks(StackName=args.stack_name)
    except ClientError as err:
        if "does not exist" in str(err):
            print(f"Stack {args.stack_name} does not exist in {session.region_name}. Nothing to do.")
            return
        raise

    bucket = bucket_of(cfn, args.stack_name)
    if bucket and not args.yes:
        answer = input(f"This deletes ALL files in s3://{bucket} and the stack {args.stack_name}.\n"
                       f"Type the bucket name to confirm: ")
        if answer.strip() != bucket:
            sys.exit("Confirmation did not match. Nothing was deleted.")

    if bucket:
        count = empty_bucket(session.client("s3"), bucket)
        print(f"Emptied s3://{bucket} ({count} objects deleted).")

    print(f"Deleting stack {args.stack_name} ...")
    cfn.delete_stack(StackName=args.stack_name)
    cfn.get_waiter("stack_delete_complete").wait(StackName=args.stack_name)
    print("Stack and bucket deleted.")
    print('Next: remove AWS_BUCKET_NAME from .env and set fileStrategy to "local" in librechat.yaml.')


if __name__ == "__main__":
    main()
