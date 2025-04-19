#!/bin/bash

echo "Stopping Redis container..."
podman stop redis

echo "Removing Redis container..."
podman rm redis

echo "✅ Redis container stopped and removed" 