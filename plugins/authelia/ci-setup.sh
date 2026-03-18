#!/bin/bash
set -euo pipefail

# Install Authelia CLI
AUTHELIA_VERSION="${AUTHELIA_VERSION:-4.38.18}"
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

echo "Installing authelia ${AUTHELIA_VERSION}..."
curl -sSLf "https://github.com/authelia/authelia/releases/download/v${AUTHELIA_VERSION}/authelia-v${AUTHELIA_VERSION}-${OS}-${ARCH}.tar.gz" \
  | tar xz -C /usr/local/bin/ authelia
chmod +x /usr/local/bin/authelia

authelia --version
