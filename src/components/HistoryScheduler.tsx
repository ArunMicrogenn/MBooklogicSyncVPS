import React, { useState } from 'react';
import { 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  RotateCw, 
  Trash2, 
  ChevronRight, 
  ChevronDown, 
  Terminal, 
  Calendar,
  Activity,
  Layers
} from 'lucide-react';
import { SyncExecutionResult, SyncLogEntry } from '../types';

interface HistorySchedulerProps {
  history: any[];
  onTriggerSync: () => void;
  isExecuting: boolean;
  scheduledInterval: number; // in minutes, 0 = disabled
  setScheduledInterval: (val: number) => void;
}

export const HistoryScheduler: React.FC<HistorySchedulerProps> = ({
  history,
  onTriggerSync,
  isExecuting,
  scheduledInterval,
  setScheduledInterval,
}) => {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const toggleExpand = (jobId: string) => {
    setExpandedJobId(expandedJobId === jobId ? null : jobId);
  };

  const totalAllInserted = history.reduce((acc, h) => acc + (h.totalInserted || 0), 0);
  const totalAllUpdated = history.reduce((acc, h) => acc + (h.totalUpdated || 0), 0);
  const avgDuration = history.length > 0 ? Math.round(history.reduce((acc, h) => acc + (h.durationMs || 0), 0) / history.length) : 0;

  return (
    <div id="history-scheduler-view" className="space-y-4">
      {/* Scheduler Control Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-3">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Automated Pipeline Scheduler & Cron Settings</h2>
              <p className="text-xs text-slate-400">Configure recurring synchronization intervals for automated VPS database ingestion</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">Sync Interval:</span>
            <select
              value={scheduledInterval}
              onChange={(e) => setScheduledInterval(Number(e.target.value))}
              className="bg-slate-950 border border-slate-700 text-cyan-400 font-mono text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="0">Manual Trigger Only</option>
              <option value="1">Every 1 Minute (High Frequency)</option>
              <option value="5">Every 5 Minutes</option>
              <option value="15">Every 15 Minutes (Standard)</option>
              <option value="60">Hourly</option>
              <option value="1440">Daily (24 Hours)</option>
            </select>
          </div>
        </div>

        {/* Scheduler Status Banner */}
        <div className={`p-3.5 rounded-lg border flex items-center justify-between text-xs ${
          scheduledInterval > 0 
            ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' 
            : 'bg-slate-950/60 border-slate-800 text-slate-400'
        }`}>
          <div className="flex items-center gap-2">
            <Activity className={`w-4 h-4 ${scheduledInterval > 0 ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <span>
              {scheduledInterval > 0 
                ? `Background scheduler active: Polling API every ${scheduledInterval} minute(s) and upserting into PostgreSQL.` 
                : 'Scheduler is idle. Ingestion runs on manual trigger.'}
            </span>
          </div>

          <button
            onClick={onTriggerSync}
            disabled={isExecuting}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isExecuting ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Run Sync Now</span>
          </button>
        </div>
      </div>

      {/* Aggregate Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-[11px] text-slate-400 font-mono block mb-1">Total Pipeline Runs</span>
          <span className="text-xl font-bold text-slate-100 font-mono">{history.length}</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-[11px] text-slate-400 font-mono block mb-1">Total Rows Inserted</span>
          <span className="text-xl font-bold text-emerald-400 font-mono">+{totalAllInserted}</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-[11px] text-slate-400 font-mono block mb-1">Total Rows Updated</span>
          <span className="text-xl font-bold text-amber-400 font-mono">{totalAllUpdated}</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span className="text-[11px] text-slate-400 font-mono block mb-1">Avg Execution Time</span>
          <span className="text-xl font-bold text-cyan-400 font-mono">{avgDuration}ms</span>
        </div>
      </div>

      {/* History Runs List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-400" />
          <span>Execution Audit Trail & History</span>
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-xs font-mono">
            {history.length} jobs recorded
          </span>
        </h3>

        {history.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-xs text-slate-500">
            No pipeline executions yet. Click <strong>Execute Sync</strong> in the header or pipeline view to start.
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((job) => {
              const isExpanded = expandedJobId === job.jobId;
              const isSuccess = job.status === 'completed' && job.totalFailed === 0;

              return (
                <div 
                  key={job.jobId}
                  className="bg-slate-950 border border-slate-800/80 rounded-lg overflow-hidden transition-all"
                >
                  <div 
                    onClick={() => toggleExpand(job.jobId)}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 cursor-pointer hover:bg-slate-900/60 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isSuccess ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-200 font-mono">{job.jobId}</span>
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-teal-300 text-[11px] font-mono">
                            Table: "{job.tableName || 'api_records'}"
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {new Date(job.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono">
                      <span className="text-cyan-400">Fetched: {job.totalFetched}</span>
                      <span className="text-emerald-400">+{job.totalInserted} ins</span>
                      <span className="text-amber-400">{job.totalUpdated} upd</span>
                      <span className="text-slate-400">{job.durationMs}ms</span>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>

                  {/* Expanded Logs */}
                  {isExpanded && job.logs && (
                    <div className="p-3 bg-slate-950 border-t border-slate-800 font-mono text-xs space-y-1">
                      <div className="text-[11px] text-slate-500 pb-1 flex items-center gap-1">
                        <Terminal className="w-3 h-3" /> Job Execution Steps:
                      </div>
                      {job.logs.map((l: SyncLogEntry) => (
                        <div key={l.id} className="text-slate-400 text-[11px] pl-2 border-l border-slate-800">
                          <span className="text-slate-600">[{l.timestamp.split('T')[1]?.split('.')[0]}]</span>{' '}
                          <span className={l.level === 'error' ? 'text-rose-400' : l.level === 'success' ? 'text-emerald-400' : 'text-slate-300'}>
                            {l.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
