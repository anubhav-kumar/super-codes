"""Create or update the LibreChat file-storage stack, then point .env at its bucket.

Run with Granted credentials, from the repo root:
    assume <profile>
    infra/venv/bin/python infra/deploy.py

If the stack does not exist it is created; otherwise it is updated. When the stack is ready,
AWS_REGION and AWS_BUCKET_NAME are written to the repo's .env (no other key is touched).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

INFRA_DIR = Path(__file__).resolve().parent
TEMPLATE = INFRA_DIR / "librechat-files.yml"
ENV_FILE = INFRA_DIR.parent / ".env"
DEFAULT_STACK = "librechat-files"


def stack_status(cfn, name: str) -> str | None:
    try:
        return cfn.describe_stacks(StackName=name)["Stacks"][0]["StackStatus"]
    except ClientError as err:
        if "does not exist" in str(err):
            return None
        raise


def deploy(cfn, name: str, template: str) -> None:
    status = stack_status(cfn, name)
    if status == "ROLLBACK_COMPLETE":
        sys.exit(
            f"Stack {name} is in ROLLBACK_COMPLETE (its first create failed) and cannot be updated. "
            "Run infra/undeploy.py, fix the cause, then deploy again."
        )
    if status is None:
        print(f"Creating stack {name} ...")
        cfn.create_stack(StackName=name, TemplateBody=template)
        cfn.get_waiter("stack_create_complete").wait(StackName=name)
        print("Stack created.")
        return
    print(f"Updating stack {name} (current status {status}) ...")
    try:
        cfn.update_stack(StackName=name, TemplateBody=template)
    except ClientError as err:
        if "No updates are to be performed" in str(err):
            print("Stack is already up to date.")
            return
        raise
    cfn.get_waiter("stack_update_complete").wait(StackName=name)
    print("Stack updated.")


def outputs(cfn, name: str) -> dict[str, str]:
    stack = cfn.describe_stacks(StackName=name)["Stacks"][0]
    return {o["OutputKey"]: o["OutputValue"] for o in stack.get("Outputs", [])}


def update_env(values: dict[str, str]) -> None:
    lines = ENV_FILE.read_text(encoding="utf-8").split("\n") if ENV_FILE.exists() else []
    for key, value in values.items():
        pattern = re.compile(rf"^#?\s*{key}=")
        matches = [i for i, line in enumerate(lines) if pattern.match(line)]
        if matches:
            lines[matches[0]] = f"{key}={value}"
            for i in reversed(matches[1:]):
                del lines[i]
        else:
            if lines and lines[-1] == "":
                lines.insert(len(lines) - 1, f"{key}={value}")
            else:
                lines.append(f"{key}={value}")
    ENV_FILE.write_text("\n".join(lines), encoding="utf-8")
    os.chmod(ENV_FILE, 0o600)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--stack-name", default=DEFAULT_STACK)
    args = parser.parse_args()

    session = boto3.Session()
    if not session.region_name:
        sys.exit("No AWS region in the session. Run `assume <profile>` (the profile must set a region).")
    cfn = session.client("cloudformation")

    deploy(cfn, args.stack_name, TEMPLATE.read_text(encoding="utf-8"))

    out = outputs(cfn, args.stack_name)
    values = {"AWS_REGION": out["Region"], "AWS_BUCKET_NAME": out["BucketName"]}
    update_env(values)
    print(f"Bucket: {values['AWS_BUCKET_NAME']} ({values['AWS_REGION']})")
    print(f"Wrote AWS_REGION and AWS_BUCKET_NAME to {ENV_FILE}")


if __name__ == "__main__":
    main()
