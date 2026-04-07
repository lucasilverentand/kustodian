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

INSTALL_DIR="/usr/local/bin"
SUDO=""
if [ ! -w "$INSTALL_DIR" ]; then
  SUDO="sudo"
fi

echo "Installing k0sctl ${K0SCTL_VERSION}..."
curl -sSLf "https://github.com/k0sproject/k0sctl/releases/download/${K0SCTL_VERSION}/k0sctl-${OS}-${ARCH}" \
  -o /tmp/k0sctl
$SUDO install -m 755 /tmp/k0sctl "$INSTALL_DIR/k0sctl"
rm -f /tmp/k0sctl

k0sctl version
