#!/bin/bash

# Get the absolute path of the redis-data directory
REDIS_DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/redis-data"

echo "Removing Redis persisted data..."
if [ -d "$REDIS_DATA_DIR" ]; then
    rm -rf "$REDIS_DATA_DIR"/*
    echo "✅ Redis data directory contents removed"
else
    echo "ℹ️ Redis data directory does not exist"
fi

echo "Redis data directory: $REDIS_DATA_DIR" 