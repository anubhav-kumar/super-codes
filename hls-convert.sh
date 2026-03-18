#!/bin/bash

# HLS Converter Script
# Usage: ./hls-convert.sh <input_video> [output_dir]

set -e

INPUT_FILE="$1"
OUTPUT_DIR="${2:-hls_output}"
SEGMENT_DURATION=6       # seconds per segment
PLAYLIST_NAME="index.m3u8"

# ── Validate input ──────────────────────────────────────────────────────────────
if [ -z "$INPUT_FILE" ]; then
  echo "Usage: $0 <input_video> [output_dir]"
  echo "Example: $0 movie.mp4 ./output"
  exit 1
fi

if [ ! -f "$INPUT_FILE" ]; then
  echo "Error: File '$INPUT_FILE' not found."
  exit 1
fi

if ! command -v ffmpeg &>/dev/null; then
  echo "Error: ffmpeg is not installed."
  echo "Install it with: sudo apt install -y ffmpeg"
  exit 1
fi

# ── Prepare output directory ────────────────────────────────────────────────────
mkdir -p "$OUTPUT_DIR"

echo "Converting '$INPUT_FILE' to HLS..."
echo "Output directory : $OUTPUT_DIR"
echo "Segment duration : ${SEGMENT_DURATION}s"

# ── FFmpeg conversion ───────────────────────────────────────────────────────────
ffmpeg -i "$INPUT_FILE" \
  -c:v libx264 \
  -c:a aac \
  -preset fast \
  -crf 22 \
  -sc_threshold 0 \
  -g $((SEGMENT_DURATION * 30)) \
  -keyint_min $((SEGMENT_DURATION * 30)) \
  -hls_time "$SEGMENT_DURATION" \
  -hls_playlist_type vod \
  -hls_segment_filename "$OUTPUT_DIR/segment_%03d.ts" \
  "$OUTPUT_DIR/$PLAYLIST_NAME"

echo ""
echo "Done! Files written to: $OUTPUT_DIR/"
echo "  Playlist : $OUTPUT_DIR/$PLAYLIST_NAME"
echo "  Segments : $(ls "$OUTPUT_DIR"/*.ts 2>/dev/null | wc -l | tr -d ' ') .ts files"
