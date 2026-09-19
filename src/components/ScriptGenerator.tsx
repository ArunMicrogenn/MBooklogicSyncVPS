import React, { useState } from 'react';
import { 
  FileCode, 
  Terminal, 
  Copy, 
  Check, 
  Download, 
  Server, 
  ShieldAlert, 
  Box, 
  Cpu, 
  BookOpen,
  Sparkles
} from 'lucide-react';
import { ApiConfig, FieldMapping, PostgresConfig } from '../types';

interface ScriptGeneratorProps {
  apiConfig: ApiConfig;
  pgConfig: PostgresConfig;
  fieldMappings: FieldMapping[];
}

export const ScriptGenerator: React.FC<ScriptGeneratorProps> = ({
  apiConfig,
  pgConfig,
  fieldMappings,
}) => {
  const [activeLang, setActiveLang] = useState<'node' | 'python' | 'docker' | 'systemd' | 'vps_guide'>('node');
  const [copied, setCopied] = useState(false);

  const activeColumns = fieldMappings.filter(m => m.selected);
  const tableName = (pgConfig.tableName || 'api_records').replace(/[^a-zA-Z0-9_]/g, '_');
  const pkCol = activeColumns.find(m => m.isPrimaryKey)?.columnName || 'id';

  // 1. Node.js Script
  const nodeScript = `/**
 * Standalone API to PostgreSQL Ingestion Script for VPS
 * Run with: node sync-worker.js
 * Requires: npm install pg
 */

import pg from 'pg';

const API_CONFIG = {
  url: '${apiConfig.url || 'https://api.example.com/data'}',
  method: '${apiConfig.method || 'GET'}',
  headers: {
    'Accept': 'application/json',
${apiConfig.headers.filter(h => h.enabled && h.key).map(h => `    '${h.key}': '${h.value}',`).join('\n')}${apiConfig.authType === 'bearer' && apiConfig.bearerToken ? `\n    'Authorization': 'Bearer ${apiConfig.bearerToken}',` : ''}
  },
  dataPath: '${apiConfig.dataPath || ''}',
};

const PG_CONFIG = {
  host: process.env.PG_HOST || '${pgConfig.host || 'localhost'}',
  port: parseInt(process.env.PG_PORT || '${pgConfig.port || 5432}', 10),
  database: process.env.PG_DATABASE || '${pgConfig.database || 'postgres'}',
  user: process.env.PG_USER || '${pgConfig.user || 'postgres'}',
  password: process.env.PG_PASSWORD || '${pgConfig.password || 'YOUR_PASSWORD'}',
  ssl: ${pgConfig.ssl === 'require' || pgConfig.ssl === true ? '{ rejectUnauthorized: false }' : 'false'},
};

const TABLE_NAME = '${tableName}';

async function runETLPipeline() {
  console.log(\`[\${new Date().toISOString()}] Fetching from API: \${API_CONFIG.url}\`);
  const response = await fetch(API_CONFIG.url, {
    method: API_CONFIG.method,
    headers: API_CONFIG.headers,
  });

  if (!response.ok) {
    throw new Error(\`API HTTP error \${response.status}: \${await response.text()}\`);
  }

  const payload = await response.json();
  let records = API_CONFIG.dataPath 
    ? API_CONFIG.dataPath.split('.').reduce((o, i) => o?.[i], payload) 
    : (Array.isArray(payload) ? payload : [payload]);

  if (!Array.isArray(records)) records = [records];
  console.log(\`Extracted \${records.length} records. Connecting to PostgreSQL on VPS...\`);

  const client = new pg.Client(PG_CONFIG);
  await client.connect();

  try {
    await client.query('BEGIN');

    // Create table if not exists
    await client.query(\`
      CREATE TABLE IF NOT EXISTS "\${TABLE_NAME}" (
${activeColumns.map(m => `        "${m.columnName}" ${m.columnType}${m.isPrimaryKey ? ' PRIMARY KEY' : ''}`).join(',\n')}
      );
    \`);

    const colNames = [${activeColumns.map(m => `'"${m.columnName}"'`).join(', ')}].join(', ');
    let inserted = 0;

    for (const record of records) {
      const values = [
${activeColumns.map((m, idx) => {
  let accessor = `record['${m.apiKey}']`;
  if (m.transformFunction === 'json_stringify' || m.columnType === 'JSONB') accessor = `typeof ${accessor} === 'object' ? JSON.stringify(${accessor}) : ${accessor}`;
  else if (m.transformFunction === 'to_number') accessor = `Number(${accessor})`;
  else if (m.transformFunction === 'to_boolean') accessor = `Boolean(${accessor})`;
  return `        ${accessor} ?? null`;
}).join(',\n')}
      ];

      const placeholders = values.map((_, i) => \`$\${i + 1}\`).join(', ');
      
      const query = \`
        INSERT INTO "\${TABLE_NAME}" (\${colNames})
        VALUES (\${placeholders})
        ON CONFLICT ("${pkCol}") DO UPDATE SET
${activeColumns.filter(m => !m.isPrimaryKey).map(m => `          "${m.columnName}" = EXCLUDED."${m.columnName}"`).join(',\n')}
      \`;

      await client.query(query, values);
      inserted++;
    }

    await client.query('COMMIT');
    console.log(\`✅ Successfully inserted/upserted \${inserted} records into "\${TABLE_NAME}"!\`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Ingestion failed:', err);
  } finally {
    await client.end();
  }
}

runETLPipeline();
`;

  // 2. Python Script
  const pythonScript = `"""
Standalone API to PostgreSQL ETL Pipeline for VPS
Run with: python3 sync_pipeline.py
Requires: pip install requests psycopg2-binary
"""

import os
import json
import requests
import psycopg2
from psycopg2.extras import execute_batch

API_URL = "${apiConfig.url || 'https://api.example.com/data'}"
API_HEADERS = {
    "Accept": "application/json",
${apiConfig.headers.filter(h => h.enabled && h.key).map(h => `    "${h.key}": "${h.value}",`).join('\n')}${apiConfig.authType === 'bearer' && apiConfig.bearerToken ? `\n    "Authorization": "Bearer ${apiConfig.bearerToken}",` : ''}
}
DATA_PATH = "${apiConfig.dataPath || ''}"

PG_HOST = os.getenv("PG_HOST", "${pgConfig.host || 'localhost'}")
PG_PORT = int(os.getenv("PG_PORT", ${pgConfig.port || 5432}))
PG_DB = os.getenv("PG_DATABASE", "${pgConfig.database || 'postgres'}")
PG_USER = os.getenv("PG_USER", "${pgConfig.user || 'postgres'}")
PG_PASSWORD = os.getenv("PG_PASSWORD", "${pgConfig.password || 'YOUR_PASSWORD'}")

TABLE_NAME = "${tableName}"

def fetch_and_insert():
    print(f"Fetching records from: {API_URL}")
    res = requests.get(API_URL, headers=API_HEADERS, timeout=30)
    res.raise_for_status()
    data = res.json()

    # Extract records
    records = data
    if DATA_PATH:
        for key in DATA_PATH.split('.'):
            if key in records:
                records = records[key]

    if not isinstance(records, list):
        records = [records]

    print(f"Extracted {len(records)} records. Connecting to VPS Postgres...")

    conn = psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        dbname=PG_DB,
        user=PG_USER,
        password=PG_PASSWORD
    )
    cur = conn.cursor()

    try:
        # Create table if not exists
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS "{TABLE_NAME}" (
${activeColumns.map(m => `                "${m.columnName}" ${m.columnType}${m.isPrimaryKey ? ' PRIMARY KEY' : ''}`).join(',\n')}
            );
        """)

        # Prepare Batch Insert with UPSERT
        col_names = [${activeColumns.map(m => `'"${m.columnName}"'`).join(', ')}]
        placeholders = ", ".join(["%s"] * len(col_names))
        
        insert_sql = f"""
            INSERT INTO "{TABLE_NAME}" ({', '.join(col_names)})
            VALUES ({placeholders})
            ON CONFLICT ("${pkCol}") DO UPDATE SET
${activeColumns.filter(m => !m.isPrimaryKey).map(m => `                "${m.columnName}" = EXCLUDED."${m.columnName}"`).join(',\n')}
        """

        rows_to_insert = []
        for r in records:
            row = (
${activeColumns.map(m => {
  let getter = `r.get("${m.apiKey}")`;
  if (m.columnType === 'JSONB') getter = `json.dumps(${getter}) if isinstance(${getter}, (dict, list)) else ${getter}`;
  return `                ${getter},`;
}).join('\n')}
            )
            rows_to_insert.append(row)

        execute_batch(cur, insert_sql, rows_to_insert, page_size=100)
        conn.commit()
        print(f"✅ Successfully inserted/updated {len(rows_to_insert)} rows into '{TABLE_NAME}'!")

    except Exception as e:
        conn.rollback()
        print(f"❌ Error during sync: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    fetch_and_insert()
`;

  // 3. Docker Compose
  const dockerCompose = `# docker-compose.yml - Run on your VPS for automated recurring API ingestion
version: '3.8'

services:
  api-postgres-sync:
    image: node:20-alpine
    container_name: api_postgres_sync_worker
    restart: unless-stopped
    working_dir: /app
    volumes:
      - ./sync-worker.js:/app/sync-worker.js
    environment:
      - PG_HOST=${pgConfig.host || 'postgres_host'}
      - PG_PORT=${pgConfig.port || 5432}
      - PG_DATABASE=${pgConfig.database || 'postgres'}
      - PG_USER=${pgConfig.user || 'postgres'}
      - PG_PASSWORD=${pgConfig.password || 'secret'}
    command: >
      sh -c "npm install pg &&
             while true; do
               echo '[SYNC] Starting periodic API ingestion...';
               node sync-worker.js;
               echo '[SYNC] Sleeping for 15 minutes...';
               sleep 900;
             done"
`;

  // 4. Linux Systemd Service & Timer
  const systemdService = `# 1. /etc/systemd/system/api-postgres-sync.service
[Unit]
Description=API to PostgreSQL Ingestion Service
After=network.target postgresql.service

[Service]
Type=oneshot
User=root
WorkingDirectory=/opt/api-sync
ExecStart=/usr/bin/node /opt/api-sync/sync-worker.js
Restart=on-failure

[Install]
WantedBy=multi-user.target

---

# 2. /etc/systemd/system/api-postgres-sync.timer (Runs every 15 minutes)
[Unit]
Description=Run API to PostgreSQL Sync Every 15 Minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
Unit=api-postgres-sync.service

[Install]
WantedBy=timers.target

---
# Enable on your VPS:
# sudo systemctl daemon-reload
# sudo systemctl enable --now api-postgres-sync.timer
`;

  // 5. VPS Guide
  const vpsGuide = `# Ubuntu / Debian VPS PostgreSQL Setup Guide

1. Allow External Access in PostgreSQL config:
   sudo nano /etc/postgresql/16/main/postgresql.conf
   Change:
   listen_addresses = '*'

2. Configure Client Authentication (pg_hba.conf):
   sudo nano /etc/postgresql/16/main/pg_hba.conf
   Add line at bottom:
   host    all             all             0.0.0.0/0               scram-sha-256

3. Open Firewall Port 5432 (UFW):
   sudo ufw allow 5432/tcp
   sudo ufw status

4. Restart PostgreSQL:
   sudo systemctl restart postgresql

5. Set Password for postgres user:
   sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'YOUR_STRONG_PASSWORD';"
`;

  const getActiveCode = () => {
    switch (activeLang) {
      case 'node': return nodeScript;
      case 'python': return pythonScript;
      case 'docker': return dockerCompose;
      case 'systemd': return systemdService;
      case 'vps_guide': return vpsGuide;
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(getActiveCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCode = () => {
    const code = getActiveCode();
    let filename = 'sync-worker.js';
    if (activeLang === 'python') filename = 'sync_pipeline.py';
    if (activeLang === 'docker') filename = 'docker-compose.yml';
    if (activeLang === 'systemd') filename = 'api-sync.service';
    if (activeLang === 'vps_guide') filename = 'vps-postgres-setup.md';

    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div id="vps-script-generator" className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-xs">
            <FileCode className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span>Production VPS Deployment Scripts</span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-mono border border-cyan-500/20">
                Auto-Configured
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Ready-to-run ETL scripts tailored with your exact API source, PostgreSQL credentials, and table schema
            </p>
          </div>
        </div>

        {/* Copy & Download Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={copyCode}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy Script'}</span>
          </button>

          <button
            onClick={downloadCode}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-slate-950 flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-600/20"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download File</span>
          </button>
        </div>
      </div>

      {/* Language / Format Tabs */}
      <div className="flex border-b border-slate-800 gap-1 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setActiveLang('node')}
          className={`px-3 py-2 rounded-t-lg font-mono font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeLang === 'node'
              ? 'bg-slate-950 text-cyan-400 border-t-2 border-cyan-400 border-x border-slate-800'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
          <span>Node.js (sync-worker.js)</span>
        </button>

        <button
          onClick={() => setActiveLang('python')}
          className={`px-3 py-2 rounded-t-lg font-mono font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeLang === 'python'
              ? 'bg-slate-950 text-cyan-400 border-t-2 border-cyan-400 border-x border-slate-800'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileCode className="w-3.5 h-3.5 text-amber-400" />
          <span>Python 3 (sync_pipeline.py)</span>
        </button>

        <button
          onClick={() => setActiveLang('docker')}
          className={`px-3 py-2 rounded-t-lg font-mono font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeLang === 'docker'
              ? 'bg-slate-950 text-cyan-400 border-t-2 border-cyan-400 border-x border-slate-800'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Box className="w-3.5 h-3.5 text-cyan-400" />
          <span>Docker Compose (VPS Cron Service)</span>
        </button>

        <button
          onClick={() => setActiveLang('systemd')}
          className={`px-3 py-2 rounded-t-lg font-mono font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeLang === 'systemd'
              ? 'bg-slate-950 text-cyan-400 border-t-2 border-cyan-400 border-x border-slate-800'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-teal-400" />
          <span>Systemd Service & Timer</span>
        </button>

        <button
          onClick={() => setActiveLang('vps_guide')}
          className={`px-3 py-2 rounded-t-lg font-mono font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeLang === 'vps_guide'
              ? 'bg-slate-950 text-cyan-400 border-t-2 border-cyan-400 border-x border-slate-800'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
          <span>VPS Postgres Setup & Firewall Guide</span>
        </button>
      </div>

      {/* Code Viewer */}
      <div className="bg-slate-950 rounded-lg border border-slate-800 p-4 font-mono text-xs overflow-x-auto max-h-[550px] leading-relaxed">
        <pre className="text-cyan-300 whitespace-pre">
          {getActiveCode()}
        </pre>
      </div>
    </div>
  );
};
