#!/usr/bin/env bash
set -e

echo "=========================================="
echo "  Deploying VendraCode Brain to Cloudflare"
echo "  Subdomain: brain.vendra.uz"
echo "=========================================="

cd "$(dirname "$0")/../cloudflare"

if ! command -v npx &> /dev/null; then
  echo "Error: npx not found. Please install Node.js."
  exit 1
fi

echo "Checking Cloudflare authentication..."
npx wrangler whoami || {
  echo ""
  echo "Please log in to Cloudflare:"
  npx wrangler login
}

echo "Deploying Worker to brain.vendra.uz..."
npx wrangler deploy

echo ""
echo "=========================================="
echo "  ✓ Deployed successfully to Cloudflare!"
echo "  Live endpoint: https://brain.vendra.uz"
echo "  WebSocket URL: wss://brain.vendra.uz/ws"
echo "=========================================="
