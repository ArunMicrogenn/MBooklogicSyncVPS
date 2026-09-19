import React from 'react';
import { 
  Database, 
  Server, 
  Link, 
  ShieldCheck, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Sliders,
  HelpCircle,
  Cpu
} from 'lucide-react';
import { PostgresConfig } from '../types';

interface PostgresTargetCardProps {
  pgConfig: PostgresConfig;
  setPgConfig: React.Dispatch<React.SetStateAction<PostgresConfig>>;
  onTestConnection: () => void;
  isTesting: boolean;
  connectionTestResult: any;
}

export const PostgresTargetCard: React.FC<PostgresTargetCardProps> = ({
  pgConfig,
  setPgConfig,
  onTestConnection,
  isTesting,
  connectionTestResult,
}) => {
  return (
    <div id="postgres-target-card" className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center font-bold text-xs">
            2
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Database className="w-4 h-4 text-teal-400" />
              VPS PostgreSQL Target
            </h2>
            <p className="text-xs text-slate-400">Configure your VPS PostgreSQL instance, database credentials and target table</p>
          </div>
        </div>

        {/* Connection Mode Tabs */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setPgConfig(prev => ({ ...prev, connectionMode: 'parameters' }))}
            className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              pgConfig.connectionMode === 'parameters'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3 h-3" />
            <span>VPS Host / IP</span>
          </button>
          <button
            type="button"
            onClick={() => setPgConfig(prev => ({ ...prev, connectionMode: 'connection_string' }))}
            className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              pgConfig.connectionMode === 'connection_string'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Link className="w-3 h-3" />
            <span>URI String</span>
          </button>
          <button
            type="button"
            onClick={() => setPgConfig(prev => ({ ...prev, connectionMode: 'sandbox' }))}
            className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              pgConfig.connectionMode === 'sandbox'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3 h-3" />
            <span>Sandbox Mode</span>
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {/* Sandbox Notice */}
        {pgConfig.connectionMode === 'sandbox' && (
          <div className="p-3.5 bg-cyan-950/30 border border-cyan-500/30 rounded-lg flex items-start gap-3">
            <Cpu className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
            <div className="text-xs text-slate-300">
              <span className="font-semibold text-cyan-300">Zero-Config Sandbox Mode Active: </span>
              Simulates a live PostgreSQL 16 engine in memory. You can run immediate batch syncs, test schemas, view tables, and generate VPS deployment scripts. Switch to <strong className="text-slate-100">VPS Host / IP</strong> whenever you wish to insert directly into your real remote server.
            </div>
          </div>
        )}

        {/* Parameters Mode */}
        {pgConfig.connectionMode === 'parameters' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">VPS Host / IP Address</label>
              <input
                id="postgres-host-input"
                type="text"
                value={pgConfig.host}
                onChange={(e) => setPgConfig(prev => ({ ...prev, host: e.target.value }))}
                placeholder="e.g. 192.168.1.100 or vps.mydomain.com"
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 font-mono text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Port</label>
              <input
                id="postgres-port-input"
                type="number"
                value={pgConfig.port}
                onChange={(e) => setPgConfig(prev => ({ ...prev, port: Number(e.target.value) || 5432 }))}
                placeholder="5432"
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 font-mono text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Database Name</label>
              <input
                id="postgres-database-input"
                type="text"
                value={pgConfig.database}
                onChange={(e) => setPgConfig(prev => ({ ...prev, database: e.target.value }))}
                placeholder="postgres or app_db"
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 font-mono text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Username</label>
              <input
                id="postgres-user-input"
                type="text"
                value={pgConfig.user}
                onChange={(e) => setPgConfig(prev => ({ ...prev, user: e.target.value }))}
                placeholder="postgres"
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 font-mono text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
              <input
                id="postgres-password-input"
                type="password"
                value={pgConfig.password || ''}
                onChange={(e) => setPgConfig(prev => ({ ...prev, password: e.target.value }))}
                placeholder="••••••••••••"
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 font-mono text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                SSL / TLS Security Mode
              </label>
              <select
                id="postgres-ssl-select"
                value={typeof pgConfig.ssl === 'boolean' ? (pgConfig.ssl ? 'require' : 'disable') : pgConfig.ssl}
                onChange={(e) => setPgConfig(prev => ({ ...prev, ssl: e.target.value as any }))}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 cursor-pointer"
              >
                <option value="prefer">Prefer (Auto-detect TLS with fallback)</option>
                <option value="require">Require SSL/TLS</option>
                <option value="disable">Disable SSL (Direct TCP / Local VPS)</option>
              </select>
            </div>
          </div>
        )}

        {/* Connection String Mode */}
        {pgConfig.connectionMode === 'connection_string' && (
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">PostgreSQL URI Connection String</label>
            <input
              id="postgres-conn-string-input"
              type="password"
              value={pgConfig.connectionString || ''}
              onChange={(e) => setPgConfig(prev => ({ ...prev, connectionString: e.target.value }))}
              placeholder="postgresql://username:password@vps_ip_or_host:5432/dbname?sslmode=prefer"
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 font-mono text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-teal-500"
            />
          </div>
        )}

        {/* Target Table & Ingestion Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Target Table Name
            </label>
            <input
              id="postgres-table-name-input"
              type="text"
              value={pgConfig.tableName}
              onChange={(e) => setPgConfig(prev => ({ ...prev, tableName: e.target.value }))}
              placeholder="api_records"
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 font-mono text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              Conflict / Ingestion Strategy
            </label>
            <select
              id="postgres-conflict-mode-select"
              value={pgConfig.conflictMode}
              onChange={(e) => setPgConfig(prev => ({ ...prev, conflictMode: e.target.value as any }))}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 cursor-pointer"
            >
              <option value="upsert">UPSERT (ON CONFLICT DO UPDATE)</option>
              <option value="do_nothing">IDEMPOTENT (ON CONFLICT DO NOTHING)</option>
              <option value="insert_only">INSERT ONLY (Fail on duplicate PK)</option>
              <option value="truncate_first">TRUNCATE TABLE & Reload</option>
              <option value="drop_recreate">DROP & RECREATE TABLE</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Batch Transaction Size</label>
            <select
              id="postgres-batch-size-select"
              value={pgConfig.batchSize}
              onChange={(e) => setPgConfig(prev => ({ ...prev, batchSize: Number(e.target.value) }))}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 cursor-pointer"
            >
              <option value="50">50 rows / batch</option>
              <option value="100">100 rows / batch (Recommended)</option>
              <option value="250">250 rows / batch</option>
              <option value="500">500 rows / batch</option>
            </select>
          </div>
        </div>

        {/* Test Connection Button & Diagnostic Box */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
          <button
            id="test-postgres-conn-btn"
            type="button"
            onClick={onTestConnection}
            disabled={isTesting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-teal-400' : ''}`} />
            <span>{isTesting ? 'Pinging PostgreSQL...' : 'Test Connection & Ping'}</span>
          </button>

          {/* Test Status Indicator */}
          {connectionTestResult && (
            <div
              id="connection-test-feedback"
              className={`text-xs px-3 py-2 rounded-lg border flex items-center gap-2 flex-1 sm:flex-initial ${
                connectionTestResult.success
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-950/40 text-rose-300 border-rose-500/30'
              }`}
            >
              {connectionTestResult.success ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-semibold">{connectionTestResult.message || 'Connected!'}</span>
                    <span className="ml-2 font-mono text-[11px] text-emerald-400">
                      ({connectionTestResult.latencyMs}ms latency)
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <div>
                    <span className="font-semibold">Connection Error: </span>
                    <span>{connectionTestResult.error}</span>
                    {connectionTestResult.hint && (
                      <p className="text-[11px] text-rose-300/80 mt-1">{connectionTestResult.hint}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
