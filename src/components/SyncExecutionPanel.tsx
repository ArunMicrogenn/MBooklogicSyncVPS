import React, { useState } from 'react';
import { 
  Play, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  Terminal, 
  Layers, 
  TrendingUp, 
  Clock, 
  RefreshCw,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { SyncExecutionResult } from '../types';

interface SyncExecutionPanelProps {
  onExecuteSync: () => void;
  isExecuting: boolean;
  syncResult: SyncExecutionResult | null;
  onViewDatabase: () => void;
}

export const SyncExecutionPanel: React.FC<SyncExecutionPanelProps> = ({
  onExecuteSync,
  isExecuting,
  syncResult,
  onViewDatabase,
}) => {
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'success' | 'warn' | 'error'>('all');
  const [copiedLogs, setCopiedLogs] = useState(false);

  const logs = syncResult?.logs || [];
  const filteredLogs = logs.filter(l => logFilter === 'all' || l.level === logFilter);

  const copyLogsText = () => {
    if (!syncResult?.logs) return;
    const text = syncResult.logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  return (
    <div id="sync-execution-panel" className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-xs">
            4
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-400" />
              Ingestion Execution & Batch Telemetry
            </h2>
            <p className="text-xs text-slate-400">Trigger parameterized batch ingestion and monitor live database transactions</p>
          </div>
        </div>

        {/* Big Action Button */}
        <button
          id="run-sync-pipeline-btn"
          onClick={onExecuteSync}
          disabled={isExecuting}
          className="flex items-center justify-center gap-2.5 px-6 py-2.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {isExecuting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Executing API → Postgres Sync...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Start Ingestion Pipeline</span>
            </>
          )}
        </button>
      </div>

      {/* Metrics Row */}
      {syncResult && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* Fetched */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/90">
              <span className="text-[11px] font-mono text-slate-400 block mb-1">Total Fetched</span>
              <span className="text-lg font-bold text-cyan-400 font-mono">
                {syncResult.totalFetched}
              </span>
            </div>

            {/* Inserted */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/90">
              <span className="text-[11px] font-mono text-slate-400 block mb-1">Inserted</span>
              <span className="text-lg font-bold text-emerald-400 font-mono">
                +{syncResult.totalInserted}
              </span>
            </div>

            {/* Updated / Upserted */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/90">
              <span className="text-[11px] font-mono text-slate-400 block mb-1">Updated (Upsert)</span>
              <span className="text-lg font-bold text-amber-400 font-mono">
                {syncResult.totalUpdated}
              </span>
            </div>

            {/* Skipped */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/90">
              <span className="text-[11px] font-mono text-slate-400 block mb-1">Skipped</span>
              <span className="text-lg font-bold text-slate-400 font-mono">
                {syncResult.totalSkipped}
              </span>
            </div>

            {/* Failed */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/90">
              <span className="text-[11px] font-mono text-slate-400 block mb-1">Failed</span>
              <span className={`text-lg font-bold font-mono ${syncResult.totalFailed > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                {syncResult.totalFailed}
              </span>
            </div>

            {/* Duration */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/90">
              <span className="text-[11px] font-mono text-slate-400 block mb-1">Duration</span>
              <span className="text-lg font-bold text-teal-300 font-mono">
                {syncResult.durationMs}ms
              </span>
            </div>
          </div>

          {/* Quick jump to explorer */}
          {syncResult.totalInserted > 0 || syncResult.totalUpdated > 0 ? (
            <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  Records successfully written to PostgreSQL! View table rows in the Live Table Explorer.
                </span>
              </div>
              <button
                onClick={onViewDatabase}
                className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>Open Explorer</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Terminal Log Output */}
      <div className="mt-4">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-400" />
            <span className="font-mono text-slate-300 font-semibold">Live Audit & Execution Log</span>
            <span className="text-slate-500 text-[11px] font-mono">({filteredLogs.length} events)</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Log level filter */}
            <div className="flex bg-slate-950 rounded border border-slate-800 text-[11px] font-mono p-0.5">
              {(['all', 'info', 'success', 'warn', 'error'] as const).map(lvl => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLogFilter(lvl)}
                  className={`px-2 py-0.5 rounded capitalize cursor-pointer ${
                    logFilter === lvl ? 'bg-slate-800 text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            <button
              onClick={copyLogsText}
              disabled={logs.length === 0}
              className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1 font-mono cursor-pointer disabled:opacity-40"
            >
              {copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLogs ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <div className="bg-slate-950 font-mono text-xs p-3.5 rounded-lg border border-slate-800 max-h-64 overflow-y-auto space-y-1.5 scrollbar-thin">
          {filteredLogs.length === 0 ? (
            <div className="text-slate-500 italic py-4 text-center">
              Waiting for ingestion trigger. Logs will appear here in real-time.
            </div>
          ) : (
            filteredLogs.map(log => {
              const timeStr = log.timestamp.split('T')[1]?.split('.')[0] || log.timestamp;
              let levelColor = 'text-slate-400';
              if (log.level === 'success') levelColor = 'text-emerald-400';
              if (log.level === 'warn') levelColor = 'text-amber-400';
              if (log.level === 'error') levelColor = 'text-rose-400 font-semibold';
              if (log.level === 'info') levelColor = 'text-cyan-400';

              return (
                <div key={log.id} className="flex items-start gap-2.5 leading-relaxed">
                  <span className="text-slate-600 shrink-0 text-[11px]">{timeStr}</span>
                  <span className={`uppercase font-bold text-[10px] px-1.5 py-0.2 rounded shrink-0 ${
                    log.level === 'success' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40' :
                    log.level === 'warn' ? 'bg-amber-950 text-amber-400 border border-amber-800/40' :
                    log.level === 'error' ? 'bg-rose-950 text-rose-400 border border-rose-800/40' :
                    'bg-slate-800 text-cyan-300'
                  }`}>
                    {log.level}
                  </span>
                  <span className={`${levelColor} break-all flex-1`}>{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
