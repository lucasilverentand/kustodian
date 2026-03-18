#!/bin/bash
set -euo pipefail

# Install k0sctl
K0SCTL_VERSION="${K0SCTL_VERSION:-v0.19.4}"
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

echo "Installing k0sctl ${K0SCTL_VERSION}..."
curl -sSLf "https://github.com/k0sproject/k0sctl/releases/download/${K0SCTL_VERSION}/k0sctl-${OS}-${ARCH}" \
  -o /usr/local/bin/k0sctl
chmod +x /usr/local/bin/k0sctl

k0sctl version
