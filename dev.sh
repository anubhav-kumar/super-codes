#!/usr/bin/env bash

CONTAINER_NAME="super-codes-dev"
WORKDIR="/home/user/anubhav"

# Remove existing stopped container with same name
podman rm -f "$CONTAINER_NAME" 2>/dev/null

podman run -it \
  --name "$CONTAINER_NAME" \
  -v "$(pwd):$WORKDIR:z" \
  -w "$WORKDIR" \
  ubuntu:latest \
  bash
