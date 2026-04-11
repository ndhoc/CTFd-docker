#!/usr/bin/env bash
set -euo pipefail

# One-file entrypoint installer.
# Keep install.sh experience, but delegate all heavy lifting
# to scripts/bootstrap_vps.sh for maintainability.

REPO_URL="${REPO_URL:-https://github.com/ndhoc/CTFd-docker.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/CTFd}"
BRANCH="${BRANCH:-3.7.4}"

DOMAIN_ROOT="${DOMAIN_ROOT:-}"
FRP_TOKEN="${FRP_TOKEN:-}"
CTF_SUBDOMAIN="${CTF_SUBDOMAIN:-ctf}"
DIRECT_SUBDOMAIN="${DIRECT_SUBDOMAIN:-direct}"
DYNAMIC_SUBDOMAIN="${DYNAMIC_SUBDOMAIN:-dynamic}"

ISSUE_SSL="${ISSUE_SSL:-0}"
CF_DNS_API_TOKEN="${CF_DNS_API_TOKEN:-}"

if [[ "$(id -u)" -ne 0 ]]; then
    echo "Please run as root (use sudo)."
    exit 1
fi

echo "=============================================="
echo "  CTFd-docker Installer (install.sh)"
echo "=============================================="

if [[ -z "$DOMAIN_ROOT" ]]; then
    echo "DOMAIN_ROOT is required."
    echo "Example:"
    echo "  DOMAIN_ROOT=jil.io.vn FRP_TOKEN=your_token bash install.sh"
    echo
    echo "Optional envs:"
    echo "  REPO_URL, INSTALL_DIR, BRANCH"
    echo "  CTF_SUBDOMAIN, DIRECT_SUBDOMAIN, DYNAMIC_SUBDOMAIN"
    echo "  ISSUE_SSL=1 and CF_DNS_API_TOKEN=<token>"
    exit 1
fi

apt-get update
apt-get install -y git curl ca-certificates

if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
git fetch --all --tags
git checkout "$BRANCH"
git pull --ff-only || true

BOOTSTRAP_ARGS=(
    --domain-root "$DOMAIN_ROOT"
    --repo-url "$REPO_URL"
    --install-dir "$INSTALL_DIR"
    --branch "$BRANCH"
    --ctf-subdomain "$CTF_SUBDOMAIN"
    --direct-subdomain "$DIRECT_SUBDOMAIN"
    --dynamic-subdomain "$DYNAMIC_SUBDOMAIN"
)

if [[ -n "$FRP_TOKEN" ]]; then
    BOOTSTRAP_ARGS+=(--frp-token "$FRP_TOKEN")
fi

if [[ "$ISSUE_SSL" == "1" ]]; then
    BOOTSTRAP_ARGS+=(--issue-ssl)
    if [[ -n "$CF_DNS_API_TOKEN" ]]; then
        BOOTSTRAP_ARGS+=(--cf-token "$CF_DNS_API_TOKEN")
    fi
fi

bash scripts/bootstrap_vps.sh "${BOOTSTRAP_ARGS[@]}"
