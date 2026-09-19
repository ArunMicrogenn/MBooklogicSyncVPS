import React from 'react';
import { 
  Database, 
  ArrowRightLeft, 
  FileCode2, 
  Clock, 
  Terminal, 
  Server,
  Zap,
  Activity,
  CheckCircle2,
  AlertCircle,
  Hotel,
  Sparkles
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'booklogic' | 'pipeline' | 'explorer' | 'scripts' | 'history';
  setActiveTab: (tab: 'booklogic' | 'pipeline' | 'explorer' | 'scripts' | 'history') => void;
  vpsStatus: { connected: boolean; latency?: number; message?: string; mode?: string } | null;
  lastSyncResult: { totalInserted?: number; durationMs?: number } | null;
  onQuickRun: () => void;
  isRunning: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  vpsStatus,
  lastSyncResult,
  onQuickRun,
  isRunning,
}) => {
  return (
    <header id="app-header" className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-3 gap-3">
          
          {/* Brand & Identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-400 p-[1px] shadow-lg shadow-cyan-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                <Hotel className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-100 font-sans tracking-tight">
                  BookLogic <span className="text-cyan-400">→</span> PostgreSQL VPS Studio
                </h1>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  72.61.240.34
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono hidden sm:block">
                OTA / PMS Sync: Reservations, MarkSend, Room Availability &amp; Rate Ingestion into PostgreSQL
              </p>
            </div>
          </div>

          {/* Quick Diagnostics & Action */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* VPS Status Badge */}
            <div 
              id="vps-connection-badge"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                vpsStatus?.connected
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                  : vpsStatus === null
                  ? 'bg-slate-800/80 text-slate-400 border-slate-700'
                  : 'bg-amber-950/40 text-amber-300 border-amber-500/30'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>
                {vpsStatus?.connected 
                  ? `${vpsStatus.mode === 'sandbox' ? 'Sandbox DB' : 'VPS Postgres'}: ${vpsStatus.latency ? `${vpsStatus.latency}ms` : 'Ready'}` 
                  : '72.61.240.34: Ready'}
              </span>
              {vpsStatus?.connected ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
              )}
            </div>

            {/* Quick Run Action */}
            <button
              id="header-quick-run-btn"
              onClick={onQuickRun}
              disabled={isRunning}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-sans shadow-md shadow-cyan-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {isRunning ? (
                <>
                  <Activity className="w-3.5 h-3.5 animate-spin" />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Execute Sync</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-t border-slate-800/80 gap-1 overflow-x-auto py-1 scrollbar-none">
          <button
            id="tab-booklogic-btn"
            onClick={() => setActiveTab('booklogic')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'booklogic'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Hotel className="w-4 h-4 text-cyan-400" />
            <span>BookLogic VPS Suite (72.61.240.34)</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-cyan-500/30 text-cyan-300 font-mono">PHP &rarr; PG</span>
          </button>

          <button
            id="tab-pipeline-btn"
            onClick={() => setActiveTab('pipeline')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'pipeline'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>General REST Ingestor</span>
          </button>

          <button
            id="tab-explorer-btn"
            onClick={() => setActiveTab('explorer')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'explorer'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Live Postgres Explorer</span>
          </button>

          <button
            id="tab-scripts-btn"
            onClick={() => setActiveTab('scripts')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'scripts'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <FileCode2 className="w-4 h-4" />
            <span>VPS Deployment Scripts</span>
          </button>

          <button
            id="tab-history-btn"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'history'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Logs &amp; Scheduler</span>
          </button>
        </div>
      </div>
    </header>
  );
};
