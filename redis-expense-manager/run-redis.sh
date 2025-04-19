#!/bin/bash

# Create redis-data directory if it doesn't exist
mkdir -p redis-data

# Run Redis container with Podman
podman run \
  --name redis \
  -p 6379:6379 \
  -v $(pwd)/redis-data:/data \
  -d \
  redis:latest \
  redis-server --appendonly yes

# Check if container is running
podman ps | grep redis

echo "Redis is running on port 6379"
echo "Data is persisted in $(pwd)/redis-data" 