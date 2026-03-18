#!/bin/bash
set -euo pipefail

# Install Flux CLI
FLUX_VERSION="${FLUX_VERSION:-latest}"

echo "Installing Flux CLI (${FLUX_VERSION})..."
curl -sSLf https://fluxcd.io/install.sh | bash

flux --version
