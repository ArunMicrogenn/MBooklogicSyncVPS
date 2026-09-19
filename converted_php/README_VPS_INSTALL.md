# BookLogic Channel Manager VPS Deployment Package

Target Server: **72.61.240.34**  
Database: **BOOKLOGIC** (PostgreSQL)  
API Endpoint: `https://xrs.booklogic.net/ws/external-pms/microgenn`

---

## 🚀 Quick Automated 1-Line Installation

Log into your VPS via SSH as `root` and run:

```bash
# 1. Create deployment directory
mkdir -p /tmp/booklogic_pkg && cd /tmp/booklogic_pkg

# 2. Extract the package contents into this directory
# (or upload the files: db.php, index.php, sync_booklogic.php, cron_auto_sync.php, schema.sql, install_vps.sh)

# 3. Execute the automated installer:
chmod +x install_vps.sh
bash install_vps.sh
```

---

## 📦 Package Contents

| File | Description |
| :--- | :--- |
| `install_vps.sh` | Automated Linux installer script for Ubuntu/Debian/CentOS |
| `db.php` | PostgreSQL PDO connection configuration for `72.61.240.34` |
| `index.php` | Interactive Web Dashboard with 4-phase Auto-Sync runner & table managers |
| `cron_auto_sync.php` | CLI / Daemon / Crontab 4-phase synchronization engine |
| `sync_booklogic.php` | Individual sync handlers (`fetch`, `marksend`, `avail`, `rates`) |
| `schema.sql` | PostgreSQL DDL for all 9 required tables and indexes |
| `booklogic-sync.service` | Systemd service unit for 24/7 background sync daemon |

---

## 🛠️ Manual Installation Steps (Alternative)

### Step 1: Install Required PHP & PostgreSQL Packages

**Ubuntu / Debian:**
```bash
sudo apt update
sudo apt install -y php-cli php-fpm php-pgsql php-pdo-pgsql php-xml php-curl php-mbstring apache2
```

**CentOS / RHEL:**
```bash
sudo yum install -y php-cli php-fpm php-pgsql php-pdo-pgsql php-xml php-curl php-mbstring httpd
```

### Step 2: Copy Scripts to Web Root

```bash
sudo mkdir -p /var/www/html/booklogic
sudo cp db.php index.php sync_booklogic.php cron_auto_sync.php schema.sql /var/www/html/booklogic/
sudo chmod +x /var/www/html/booklogic/cron_auto_sync.php
sudo chown -R www-data:www-data /var/www/html/booklogic/
```

### Step 3: Initialize PostgreSQL Database

```bash
PGPASSWORD=mgenn psql -h 72.61.240.34 -U postgres -d BOOKLOGIC -f /var/www/html/booklogic/schema.sql
```

### Step 4: Run Continuous Auto-Sync Daemon

**Option A: Systemd Daemon (Recommended for 24/7 reliability):**
```bash
sudo cp booklogic-sync.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable booklogic-sync
sudo systemctl start booklogic-sync
sudo systemctl status booklogic-sync
```

**Option B: Linux Crontab (Runs every minute):**
```bash
# Add to root crontab:
* * * * * php /var/www/html/booklogic/cron_auto_sync.php >> /var/log/booklogic_sync.log 2>&1
```

**Option C: Direct Terminal Execution:**
```bash
php /var/www/html/booklogic/cron_auto_sync.php --daemon --interval=60
```

---

## 🌐 Accessing the Web Portal

Open your browser and navigate to:
`http://72.61.240.34/booklogic/index.php`

- **Sync Bookings**: Fetch reservations from BookLogic API (`<syncBookingRQ>`).
- **MarkSend**: Acknowledge unconfirmed bookings (`<markSendRQ>`).
- **Room Availability**: Push datewise allotments & stop-sales (`<availabilityUpdateRQ>`).
- **Room Rates**: Push single/double/triple occupancy pricing (`<RateUpdateRQ>`).
