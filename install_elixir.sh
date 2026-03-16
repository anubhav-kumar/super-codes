#!/usr/bin/env bash
# Usage: ./setup.sh [project_dir] [host_port]

PROJECT_DIR="${1:-$(pwd)}"
HOST_PORT="${2:-4000}"
CONTAINER_PORT=4000
POD_NAME="elixir_pod"
ELIXIR_CONTAINER="elixir_dev"
POSTGRES_CONTAINER="postgres_dev"
IMAGE_NAME="elixir-dev"

echo "Setup starting..."

mkdir -p "$PROJECT_DIR"

# -- 1. Dockerfile -------------------------------------------------------------
cat > Dockerfile <<'EOF'
FROM hexpm/elixir:1.18.3-erlang-27.3.1-ubuntu-jammy-20250126

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    git curl build-essential inotify-tools && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js 20 via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*
RUN mix local.hex --force && mix local.rebar --force

WORKDIR /app
EXPOSE 4000

CMD ["bash"]
EOF

# -- 2. Build elixir image -----------------------------------------------------
echo "Building elixir image..."
podman build -t "$IMAGE_NAME" .

if [ $? -ne 0 ]; then
  echo "Build failed. Exiting."
  exit 1
fi

# -- 3. Create pod (shared network namespace) ----------------------------------
podman pod rm -f "$POD_NAME" 2>/dev/null || true
podman pod create \
  --name "$POD_NAME" \
  -p "$HOST_PORT":"$CONTAINER_PORT" \
  -p 5432:5432

# -- 4. Start postgres container inside the pod --------------------------------
podman run -d \
  --name "$POSTGRES_CONTAINER" \
  --pod "$POD_NAME" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=app_dev \
  postgres:16

# -- 5. Start elixir container inside the pod ----------------------------------
podman run -d \
  --name "$ELIXIR_CONTAINER" \
  --pod "$POD_NAME" \
  -v "$PROJECT_DIR":/app:Z \
  -e MIX_ENV=dev \
  "$IMAGE_NAME" \
  bash -c "sleep infinity"

echo ""
echo "Pod '$POD_NAME' is running with 2 containers."
echo "  Elixir container : $ELIXIR_CONTAINER"
echo "  Postgres container: $POSTGRES_CONTAINER"
echo "  Project dir      : $PROJECT_DIR -> /app"
echo "  Browser URL      : http://localhost:$HOST_PORT"
echo ""
echo "DB connection config for config/dev.exs:"
echo "  hostname: \"localhost\""
echo "  username: \"postgres\""
echo "  password: \"postgres\""
echo "  database: \"app_dev\""
echo ""
echo "Entering elixir shell..."
podman exec -it "$ELIXIR_CONTAINER" bash