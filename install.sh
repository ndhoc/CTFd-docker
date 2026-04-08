#!/bin/bash
# ==================================================
#  CTFd Whale Fully Automated Installer
#  Repository: https://github.com/ndhoc/CTFd-docker
# ==================================================

set -e

REPO_URL="https://github.com/ndhoc/CTFd-docker.git"
INSTALL_DIR="/opt/CTFd"

echo "=============================================="
echo "  CTFd Whale - Fully Automated Installation"
echo "=============================================="

# --------------------------------------------------
# 1. Update system and install essential packages
# --------------------------------------------------
echo "[1/8] Updating system packages..."
apt update
apt upgrade -y
apt install -y git curl wget ca-certificates ufw

# --------------------------------------------------
# 2. Install Docker Engine (if not present)
# --------------------------------------------------
echo "[2/8] Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
else
    echo "Docker is already installed."
fi

# --------------------------------------------------
# 3. Install Docker Compose Plugin
# --------------------------------------------------
echo "[3/8] Installing Docker Compose plugin..."
if ! docker compose version &> /dev/null; then
    apt install -y docker-compose-plugin || {
        echo "Installing docker-compose-plugin via apt failed. Trying manual download..."
        DOCKER_CONFIG=${DOCKER_CONFIG:-/usr/local/lib/docker/cli-plugins}
        mkdir -p "$DOCKER_CONFIG"
        curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o "$DOCKER_CONFIG/docker-compose"
        chmod +x "$DOCKER_CONFIG/docker-compose"
    }
else
    echo "Docker Compose plugin is already installed."
fi

# --------------------------------------------------
# 4. Clone repository if not already in it
# --------------------------------------------------
echo "[4/8] Preparing CTFd source code..."
if [ ! -f "docker-compose.yml" ]; then
    echo "Cloning CTFd-docker repository into $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
else
    echo "Already inside CTFd directory, skipping clone."
fi

# --------------------------------------------------
# 5. Initialize Docker Swarm
# --------------------------------------------------
echo "[5/8] Initializing Docker Swarm..."
if ! docker info | grep -q "Swarm: active"; then
    docker swarm init --advertise-addr 127.0.0.1
else
    echo "Swarm is already active."
fi

# --------------------------------------------------
# 6. Create overlay network for containers
# --------------------------------------------------
echo "[6/8] Creating overlay network 'ctfd_containers'..."
if ! docker network ls | grep -q "ctfd_containers"; then
    docker network create --driver overlay --attachable --internal ctfd_containers
else
    echo "Network 'ctfd_containers' already exists."
fi

# --------------------------------------------------
# 7. Label the swarm node (required for Whale)
# --------------------------------------------------
echo "[7/8] Labeling swarm node..."
NODE_ID=$(docker node ls -q)
docker node update --label-add='name=linux-1' $NODE_ID

# --------------------------------------------------
# 8. Build and start the stack
# --------------------------------------------------
echo "[8/8] Building CTFd image and starting services..."
docker compose build --no-cache ctfd
docker compose up -d

# Wait for services to be ready
echo "Waiting for database to be ready (20 seconds)..."
sleep 20

# Initialize CTFd database
echo "Running database migrations and initialization..."
docker compose exec -T ctfd flask db upgrade || true
docker compose exec -T ctfd flask init || true

# --------------------------------------------------
# Firewall suggestion
# --------------------------------------------------
echo ""
echo "=============================================="
echo "  Installation Complete!"
echo "=============================================="
echo "  Access your CTFd instance at:"
echo "  http://$(hostname -I | awk '{print $1}')"
echo ""
echo "  If you have a domain configured, update:"
echo "  - docker-compose.yml (CTFD_URL, DIRECT_URL, DYNAMIC_URL)"
echo "  - frps/frps.ini (subdomain_host, token)"
echo "  - frpc/frpc.ini (token)"
echo ""
echo "  Recommended firewall rules (run as root):"
echo "  ufw allow 80/tcp"
echo "  ufw allow 443/tcp"
echo "  ufw allow 10001:10200/tcp"
echo "  ufw enable"
echo ""
echo "  To complete setup, open your browser and finish the CTFd wizard."
echo "=============================================="
