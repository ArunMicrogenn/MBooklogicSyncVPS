#!/usr/bin/env bash
# ==============================================================================
# BookLogic Channel Manager Auto-Sync & Web Dashboard VPS Installer
# Target VPS: 72.61.240.34 | Database: BOOKLOGIC
# Compatible with Ubuntu 20.04/22.04/24.04, Debian 11/12, CentOS/RHEL 8/9
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE}   BOOKLOGIC VPS AUTO-SYNC & WEB PORTAL DEPLOYMENT INSTALLER         ${NC}"
echo -e "${BLUE}======================================================================${NC}"
echo ""

# Check root privileges
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: Please run this installer as root (e.g., sudo bash install_vps.sh)${NC}"
  exit 1
fi

DEPLOY_DIR="/var/www/html/booklogic"
LOG_DIR="/var/log/booklogic"
SERVICE_NAME="booklogic-sync.service"
DB_HOST="72.61.240.34"
DB_NAME="BOOKLOGIC"
DB_USER="postgres"
DB_PASS="mgenn"

echo -e "${YELLOW}[1/7] Detecting Linux distribution and updating package lists...${NC}"
if [ -f /etc/debian_version ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y curl wget unzip git ca-certificates \
        php-cli php-fpm php-pgsql php-pdo-pgsql php-xml php-curl php-mbstring \
        postgresql-client apache2 || apt-get install -y nginx
elif [ -f /etc/redhat-release ]; then
    yum update -y
    yum install -y epel-release
    yum install -y curl wget unzip git ca-certificates \
        php-cli php-fpm php-pgsql php-pdo-pgsql php-xml php-curl php-mbstring \
        postgresql httpd || yum install -y nginx
fi

echo -e "${GREEN}✓ PHP and dependencies installed successfully.${NC}"

echo -e "${YELLOW}[2/7] Creating application and log directories...${NC}"
mkdir -p "$DEPLOY_DIR"
mkdir -p "$LOG_DIR"
chmod 755 "$DEPLOY_DIR"
chmod 777 "$LOG_DIR"

echo -e "${YELLOW}[3/7] Copying BookLogic synchronization scripts to $DEPLOY_DIR...${NC}"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

cp -f "$SCRIPT_DIR/db.php" "$DEPLOY_DIR/db.php"
cp -f "$SCRIPT_DIR/index.php" "$DEPLOY_DIR/index.php"
cp -f "$SCRIPT_DIR/sync_booklogic.php" "$DEPLOY_DIR/sync_booklogic.php"
cp -f "$SCRIPT_DIR/cron_auto_sync.php" "$DEPLOY_DIR/cron_auto_sync.php"
cp -f "$SCRIPT_DIR/schema.sql" "$DEPLOY_DIR/schema.sql"

# Set permissions
chown -R www-data:www-data "$DEPLOY_DIR" 2>/dev/null || chown -R apache:apache "$DEPLOY_DIR" 2>/dev/null || true
chmod +x "$DEPLOY_DIR/cron_auto_sync.php"

echo -e "${GREEN}✓ Files deployed to $DEPLOY_DIR.${NC}"

echo -e "${YELLOW}[4/7] Initializing PostgreSQL database tables on $DB_HOST ($DB_NAME)...${NC}"
if command -v PGPASSWORD &>/dev/null || command -v psql &>/dev/null; then
    echo "Running schema.sql migration on PostgreSQL..."
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f "$DEPLOY_DIR/schema.sql" 2>/dev/null || {
        echo -e "${YELLOW}Notice: Direct psql migration could not connect immediately (check firewall/pg_hba). Tables will auto-initialize during first sync.${NC}"
    }
fi

echo -e "${YELLOW}[5/7] Installing Systemd 24/7 background daemon service...${NC}"
cat <<EOF > /etc/systemd/system/$SERVICE_NAME
[Unit]
Description=BookLogic Channel Manager Continuous 4-Phase Auto-Sync Daemon
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$DEPLOY_DIR
ExecStart=/usr/bin/php $DEPLOY_DIR/cron_auto_sync.php --daemon --interval=60
Restart=always
RestartSec=10
StandardOutput=append:$LOG_DIR/sync.log
StandardError=append:$LOG_DIR/sync_error.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

echo -e "${GREEN}✓ Systemd service $SERVICE_NAME enabled and started!${NC}"

echo -e "${YELLOW}[6/7] Configuring Linux Crontab backup runner...${NC}"
CRON_LINE="* * * * * php $DEPLOY_DIR/cron_auto_sync.php >> $LOG_DIR/cron.log 2>&1"
(crontab -l 2>/dev/null | grep -v "cron_auto_sync.php" ; echo "$CRON_LINE") | crontab -

echo -e "${GREEN}✓ Crontab entry added successfully.${NC}"

echo -e "${YELLOW}[7/7] Configuring Web Server for Browser Portal...${NC}"
if systemctl is-active --quiet apache2; then
    systemctl restart apache2
elif systemctl is-active --quiet httpd; then
    systemctl restart httpd
elif systemctl is-active --quiet nginx; then
    systemctl restart nginx
fi

echo ""
echo -e "${GREEN}======================================================================${NC}"
echo -e "${GREEN}   BOOKLOGIC VPS DEPLOYMENT COMPLETED SUCCESSFULLY!                 ${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo ""
echo -e "Web Management Portal:  ${BLUE}http://$DB_HOST/booklogic/index.php${NC} (or http://localhost/booklogic/)"
echo -e "Background Daemon:      ${BLUE}systemctl status $SERVICE_NAME${NC}"
echo -e "Live Sync Logs:         ${BLUE}tail -f $LOG_DIR/sync.log${NC}"
echo -e "Manual Trigger:         ${BLUE}php $DEPLOY_DIR/cron_auto_sync.php${NC}"
echo ""
