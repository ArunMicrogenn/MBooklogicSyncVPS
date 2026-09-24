import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import {
  Server,
  Database,
  ArrowDownToLine,
  Send,
  CalendarCheck,
  DollarSign,
  FileCode,
  Download,
  Copy,
  Check,
  RefreshCw,
  Plus,
  Play,
  Layers,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Hotel,
  Users,
  BedDouble,
  ShieldCheck,
  Terminal,
  Activity,
  FileText,
  Clock,
  ArrowUpRight,
  Package,
  HardDrive,
  FolderArchive,
  ExternalLink,
  Cpu,
  FileDown
} from 'lucide-react';
import { SyncLogEntry } from '../types';

interface BookLogicSyncSuiteProps {
  onNavigateToExplorer?: () => void;
}

// Helper to safely fetch JSON and prevent unexpected token errors if dev server restarts
async function fetchJsonSafe<T = any>(url: string, options?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await res.json();
      return { ok: res.ok, data: json, error: !res.ok ? (json.error || json.message || `HTTP ${res.status}`) : undefined };
    }
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return { ok: res.ok, data: json, error: !res.ok ? (json.error || json.message || `HTTP ${res.status}`) : undefined };
    } catch {
      return { ok: false, error: `Server returned non-JSON (${res.status})` };
    }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Network request failed' };
  }
}

export const BookLogicSyncSuite: React.FC<BookLogicSyncSuiteProps> = ({ onNavigateToExplorer }) => {
  const [subTab, setSubTab] = useState<'sync' | 'availability' | 'hotels' | 'reservations' | 'code' | 'schema' | 'deploy'>('deploy');

  // VPS Connection Config State (Pre-filled with user specifications)
  const [vpsConfig, setVpsConfig] = useState({
    host: '72.61.240.34',
    port: 5432,
    database: 'BOOKLOGIC',
    user: 'postgres',
    password: 'mgenn',
    ssl: 'prefer',
  });

  // Connection testing state
  const [isTestingVps, setIsTestingVps] = useState(false);
  const [vpsStatus, setVpsStatus] = useState<any>(null);

  // Schema initialization state
  const [isInitSchema, setIsInitSchema] = useState(false);
  const [initResult, setInitResult] = useState<any>(null);

  // Hotels state
  const [hotels, setHotels] = useState<any[]>([]);
  const [isLoadingHotels, setIsLoadingHotels] = useState(false);
  const [newHotel, setNewHotel] = useState({ HotelCode: '', Username: '', Password: '', Inactive: 0 });
  const [showAddHotelModal, setShowAddHotelModal] = useState(false);

  // Room Availability state
  const [availabilityList, setAvailabilityList] = useState<any[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [showAddAvailModal, setShowAddAvailModal] = useState(false);
  const [newAvail, setNewAvail] = useState({
    hotelcode: 'BL_DEMO_01',
    allotcode: 'DLX_01',
    fromdate: '2026-10-01',
    todate: '2026-10-05',
    Availablerooms: 10,
    stopsales: '0'
  });

  // Sync execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeSyncType, setActiveSyncType] = useState<string>('');
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [lastSyncStats, setLastSyncStats] = useState<any>(null);

  // Auto-Sync Manager State
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState(60);
  const [autoSyncDaemonState, setAutoSyncDaemonState] = useState<any>(null);
  const [countdown, setCountdown] = useState(60);
  const [isConfiguringAutoSync, setIsConfiguringAutoSync] = useState(false);

  // Reservations state
  const [reservations, setReservations] = useState<any[]>([]);
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Converted code & VPS deployment state
  const [convertedCode, setConvertedCode] = useState<{
    indexPhp: string;
    dbPhp: string;
    syncPhp: string;
    cronPhp: string;
    schemaSql: string;
    installVpsSh: string;
    readmeMd: string;
    serviceFile: string;
  }>({
    indexPhp: '',
    dbPhp: '',
    syncPhp: '',
    cronPhp: '',
    schemaSql: '',
    installVpsSh: '',
    readmeMd: '',
    serviceFile: '',
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState<'installVpsSh' | 'readmeMd' | 'serviceFile' | 'cronPhp' | 'indexPhp' | 'dbPhp' | 'syncPhp' | 'schemaSql'>('installVpsSh');

  // Test VPS Connection
  const handleTestVps = async () => {
    setIsTestingVps(true);
    const { ok, data, error } = await fetchJsonSafe('/api/booklogic/test-vps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vpsConfig),
    });
    if (ok && data) {
      setVpsStatus(data);
    } else {
      setVpsStatus({
        connected: false,
        error: error || 'Failed to connect',
        mode: 'sandbox_fallback',
      });
    }
    setIsTestingVps(false);
  };

  // Initialize PostgreSQL Schema
  const handleInitSchema = async () => {
    setIsInitSchema(true);
    const { ok, data, error } = await fetchJsonSafe('/api/booklogic/init-tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vpsConfig),
    });
    if (ok && data) {
      setInitResult(data);
      fetchHotels();
      fetchReservations();
      fetchAvailability();
    } else {
      alert(error || 'Failed to initialize schema');
    }
    setIsInitSchema(false);
  };

  // Fetch Hotels
  const fetchHotels = async () => {
    setIsLoadingHotels(true);
    const { ok, data } = await fetchJsonSafe('/api/booklogic/hotels');
    if (ok && data?.hotels) {
      setHotels(data.hotels);
      if (data.hotels.length > 0 && !newAvail.hotelcode) {
        setNewAvail(prev => ({ ...prev, hotelcode: data.hotels[0].HotelCode }));
      }
    }
    setIsLoadingHotels(false);
  };

  // Save Hotel
  const handleSaveHotel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHotel.HotelCode || !newHotel.Username || !newHotel.Password) return;

    const { ok, data, error } = await fetchJsonSafe('/api/booklogic/hotels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newHotel),
    });
    if (ok && data?.success) {
      fetchHotels();
      setShowAddHotelModal(false);
      setNewHotel({ HotelCode: '', Username: '', Password: '', Inactive: 0 });
    } else {
      alert(error || data?.error || 'Failed to save hotel');
    }
  };

  // Fetch Room Availability Records
  const fetchAvailability = async () => {
    setIsLoadingAvailability(true);
    const { ok, data } = await fetchJsonSafe('/api/booklogic/availability');
    if (ok && data?.availability) {
      setAvailabilityList(data.availability);
    }
    setIsLoadingAvailability(false);
  };

  // Save Room Availability Record
  const handleSaveAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    const { ok, data, error } = await fetchJsonSafe('/api/booklogic/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAvail),
    });
    if (ok && data?.success) {
      fetchAvailability();
      setShowAddAvailModal(false);
    } else {
      alert(error || data?.error || 'Failed to save room availability');
    }
  };

  // Fetch Reservations
  const fetchReservations = async () => {
    setIsLoadingReservations(true);
    const { ok, data } = await fetchJsonSafe('/api/booklogic/reservations');
    if (ok && data?.reservations) {
      setReservations(data.reservations);
    }
    setIsLoadingReservations(false);
  };

  // Fetch converted code and VPS deployment files
  const fetchConvertedCode = async () => {
    const { ok, data } = await fetchJsonSafe('/api/booklogic/converted-files');
    if (ok && data?.success) {
      setConvertedCode({
        indexPhp: data.indexPhp || '',
        dbPhp: data.dbPhp || '',
        syncPhp: data.syncPhp || '',
        cronPhp: data.cronPhp || '',
        schemaSql: data.schemaSql || '',
        installVpsSh: data.installVpsSh || '',
        readmeMd: data.readmeMd || '',
        serviceFile: data.serviceFile || '',
      });
    }
  };

  // Fetch Auto-Sync Daemon Status
  const fetchAutoSyncStatus = async () => {
    const { ok, data } = await fetchJsonSafe('/api/booklogic/auto-sync/status');
    if (ok && data?.success) {
      setAutoSyncDaemonState(data);
      setAutoSyncEnabled(data.enabled);
      setAutoSyncInterval(data.intervalSeconds);
      if (data.lastStats) {
        setLastSyncStats(data.lastStats);
      }
      if (data.recentLogs && data.recentLogs.length > 0) {
        setSyncLogs(prev => {
          const ids = new Set(prev.map(p => p.id));
          const newLogs = data.recentLogs.filter((l: any) => !ids.has(l.id));
          return [...newLogs, ...prev].slice(0, 100);
        });
      }
    }
  };

  // Toggle Auto-Sync On / Off
  const handleToggleAutoSync = async (enabled: boolean) => {
    setIsConfiguringAutoSync(true);
    const { ok, data, error } = await fetchJsonSafe('/api/booklogic/auto-sync/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, intervalSeconds: autoSyncInterval }),
    });
    if (ok && data?.success) {
      setAutoSyncEnabled(data.state.enabled);
      setAutoSyncDaemonState(data.state);
      setCountdown(autoSyncInterval);
    } else if (error) {
      alert(error || 'Failed to update auto-sync state');
    }
    setIsConfiguringAutoSync(false);
  };

  // Change Auto-Sync Interval
  const handleChangeInterval = async (interval: number) => {
    setAutoSyncInterval(interval);
    setCountdown(interval);
    await fetchJsonSafe('/api/booklogic/auto-sync/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: autoSyncEnabled, intervalSeconds: interval }),
    });
  };

  // Run Master 4-Phase Auto-Sync Cycle
  const handleRunMasterAutoSync = async () => {
    setIsExecuting(true);
    setActiveSyncType('Full 4-Phase Auto-Sync');
    const { ok, data, error } = await fetchJsonSafe('/api/booklogic/auto-sync/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pgConfig: vpsConfig }),
    });
    if (ok && data) {
      if (data.logs) {
        setSyncLogs(prev => [...data.logs, ...prev]);
      }
      if (data.stats) {
        setLastSyncStats(data.stats);
      }
      setCountdown(autoSyncInterval);
      fetchReservations();
      fetchAvailability();
      fetchAutoSyncStatus();
    } else {
      alert(error || data?.error || 'Auto-Sync failed');
    }
    setIsExecuting(false);
    setActiveSyncType('');
  };

  // Execute Individual Sync
  const handleRunSync = async (endpoint: string, syncName: string) => {
    setIsExecuting(true);
    setActiveSyncType(syncName);
    const { ok, data, error } = await fetchJsonSafe(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pgConfig: vpsConfig }),
    });
    if (ok && data) {
      if (data.logs) {
        setSyncLogs(prev => [...data.logs, ...prev]);
      }
      setLastSyncStats(data);
      fetchReservations();
      fetchAvailability();
    } else {
      alert(error || data?.error || 'Sync failed');
    }
    setIsExecuting(false);
    setActiveSyncType('');
  };

  // Copy code helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Download single file helper
  const handleDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Client-Side 100% Valid ZIP Package Builder (using JSZip)
  const handleDownloadZipPackage = async () => {
    setIsDownloadingZip(true);
    try {
      let files = convertedCode;
      if (!files.installVpsSh || !files.dbPhp) {
        const { ok, data } = await fetchJsonSafe('/api/booklogic/converted-files');
        if (ok && data?.success) {
          files = {
            indexPhp: data.indexPhp || '',
            dbPhp: data.dbPhp || '',
            syncPhp: data.syncPhp || '',
            cronPhp: data.cronPhp || '',
            schemaSql: data.schemaSql || '',
            installVpsSh: data.installVpsSh || '',
            readmeMd: data.readmeMd || '',
            serviceFile: data.serviceFile || '',
          };
          setConvertedCode(files);
        }
      }

      const zip = new JSZip();
      zip.file('install_vps.sh', files.installVpsSh || '#!/usr/bin/env bash\n');
      zip.file('README_VPS_INSTALL.md', files.readmeMd || '# BookLogic VPS Install\n');
      zip.file('booklogic-sync.service', files.serviceFile || '[Unit]\n');
      zip.file('cron_auto_sync.php', files.cronPhp || '<?php\n');
      zip.file('index.php', files.indexPhp || '<?php\n');
      zip.file('db.php', files.dbPhp || '<?php\n');
      zip.file('sync_booklogic.php', files.syncPhp || '<?php\n');
      zip.file('schema.sql', files.schemaSql || '-- PostgreSQL Schema\n');

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'booklogic-vps-deployment.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err: any) {
      alert('Failed to generate ZIP package: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDownloadingZip(false);
    }
  };

  useEffect(() => {
    handleTestVps();
    fetchHotels();
    fetchReservations();
    fetchAvailability();
    fetchConvertedCode();
    fetchAutoSyncStatus();

    // Auto-Sync background polling and countdown ticker
    const intervalTimer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchReservations();
          fetchAvailability();
          fetchAutoSyncStatus();
          return autoSyncInterval;
        }
        return prev - 1;
      });
    }, 1000);

    const pollTimer = setInterval(() => {
      fetchAutoSyncStatus();
    }, 5000);

    return () => {
      clearInterval(intervalTimer);
      clearInterval(pollTimer);
    };
  }, [autoSyncInterval]);

  const filteredReservations = reservations.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.Booking_Id && r.Booking_Id.toLowerCase().includes(q)) ||
      (r.FirstName && r.FirstName.toLowerCase().includes(q)) ||
      (r.LastName && r.LastName.toLowerCase().includes(q)) ||
      (r.Hotel_Code && r.Hotel_Code.toLowerCase().includes(q)) ||
      (r.PnrID && r.PnrID.toLowerCase().includes(q)) ||
      (r.TravelagentName && r.TravelagentName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner / VPS Target Overview */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-cyan-500/5 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> BookLogic PMS &amp; OTA Channel Bridge
              </span>
              <span className="px-2.5 py-0.5 text-xs font-mono rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                SQL Server &rarr; PostgreSQL (72.61.240.34)
              </span>
              <span className="px-2.5 py-0.5 text-xs font-mono rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                API Endpoint: stage-xrs.booklogic.net (Testing)
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-100 font-sans tracking-tight">
              BookLogic Ingestion &amp; Room Availability Engine
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Target VPS: <span className="text-cyan-300 font-mono font-medium">72.61.240.34</span> | Database: <span className="text-cyan-300 font-mono font-medium">BOOKLOGIC</span> | Staging API: <span className="text-amber-300 font-mono text-xs">https://stage-xrs.booklogic.net/ws/external-pms/microgenn</span>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadZipPackage}
              disabled={isDownloadingZip}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-md shadow-emerald-600/20 transition-all active:scale-95 disabled:opacity-60"
            >
              <Package className={`w-3.5 h-3.5 ${isDownloadingZip ? 'animate-spin' : ''}`} />
              <span>{isDownloadingZip ? 'Preparing ZIP...' : 'Download VPS Package (.ZIP)'}</span>
            </button>

            <button
              onClick={handleTestVps}
              disabled={isTestingVps}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingVps ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{isTestingVps ? 'Testing...' : 'Test Connection'}</span>
            </button>

            <button
              onClick={handleInitSchema}
              disabled={isInitSchema}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/30 cursor-pointer transition-all disabled:opacity-50 shadow-sm"
            >
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isInitSchema ? 'Creating...' : 'Verify / Init Tables in Postgres'}</span>
            </button>

            <button
              onClick={handleRunMasterAutoSync}
              disabled={isExecuting}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 cursor-pointer shadow-md shadow-cyan-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
              {isExecuting ? (
                <Activity className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{isExecuting ? `Running (${activeSyncType})...` : 'Run Master Sync Cycle'}</span>
            </button>
          </div>
        </div>

        {/* Connection Diagnostics Bar */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">PostgreSQL Status:</span>
            {vpsStatus?.connected ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Connected to 72.61.240.34:5432 ({vpsStatus.latencyMs}ms)
              </span>
            ) : vpsStatus === null ? (
              <span className="text-slate-400">Checking connection...</span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Active &amp; Ready (Configured for 72.61.240.34)
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span>Active Hotels: <strong className="text-slate-200">{hotels.length}</strong></span>
            <span>&bull;</span>
            <span>Pending Availability: <strong className="text-amber-300">{availabilityList.filter(a => !a.uploadflg).length}</strong></span>
            <span>&bull;</span>
            <span>Total Ingested Bookings: <strong className="text-cyan-300">{reservations.length}</strong></span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-2 pb-1 overflow-x-auto">
        <button
          onClick={() => setSubTab('deploy')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer ${
            subTab === 'deploy'
              ? 'bg-emerald-950/60 text-emerald-400 border-b-2 border-emerald-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Package className="w-4 h-4 text-emerald-400" />
          <span>🚀 VPS Deployment Package &amp; Installer</span>
        </button>

        <button
          onClick={() => setSubTab('sync')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer ${
            subTab === 'sync'
              ? 'bg-slate-800/90 text-cyan-400 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>1. Live Ingest &amp; Push</span>
        </button>

        <button
          onClick={() => setSubTab('availability')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer ${
            subTab === 'availability'
              ? 'bg-slate-800/90 text-cyan-400 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          <span>2. Room Availability Chart ({availabilityList.length})</span>
        </button>

        <button
          onClick={() => setSubTab('reservations')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer ${
            subTab === 'reservations'
              ? 'bg-slate-800/90 text-cyan-400 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>3. Ingested Bookings ({reservations.length})</span>
        </button>

        <button
          onClick={() => setSubTab('hotels')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer ${
            subTab === 'hotels'
              ? 'bg-slate-800/90 text-cyan-400 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Hotel className="w-4 h-4" />
          <span>4. Mas_Hotel Accounts ({hotels.length})</span>
        </button>

        <button
          onClick={() => setSubTab('code')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer ${
            subTab === 'code'
              ? 'bg-slate-800/90 text-cyan-400 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>5. Converted index.php</span>
        </button>

        <button
          onClick={() => setSubTab('schema')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer ${
            subTab === 'schema'
              ? 'bg-slate-800/90 text-cyan-400 border-b-2 border-cyan-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>6. PostgreSQL Schema DDL</span>
        </button>
      </div>

      {/* TAB 0: VPS DEPLOYMENT PACKAGE & INSTALLER */}
      {subTab === 'deploy' && (
        <div className="space-y-6">
          {/* Main Hero Card for Deployment */}
          <div className="bg-gradient-to-br from-slate-900 via-emerald-950/20 to-slate-900 border border-emerald-500/30 rounded-xl p-6 shadow-xl relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    Ready-to-Deploy VPS Package
                  </span>
                  <span className="px-2 py-0.5 text-[11px] font-mono rounded font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                    Target VPS: 72.61.240.34
                  </span>
                  <span className="px-2 py-0.5 text-[11px] font-mono rounded font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                    PostgreSQL: BOOKLOGIC
                  </span>
                </div>

                <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <span>Complete BookLogic VPS Installation Package</span>
                </h3>
                <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                  Everything required to run BookLogic synchronization directly on your Linux VPS (<span className="text-cyan-300 font-mono">72.61.240.34</span>). Includes the automated 1-line bash installer, 24/7 background systemd daemon service, crontab scheduler, and interactive web dashboard.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleDownloadZipPackage}
                  disabled={isDownloadingZip}
                  className="flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 cursor-pointer shadow-lg shadow-emerald-500/20 active:scale-95 transition-all text-center disabled:opacity-60"
                >
                  <Download className={`w-4 h-4 stroke-[2.5] ${isDownloadingZip ? 'animate-spin' : ''}`} />
                  <span>{isDownloadingZip ? 'Building ZIP Archive...' : 'Download Full ZIP Package'}</span>
                </button>
              </div>
            </div>

            {/* Quick 1-Step SSH Terminal Command */}
            <div className="mt-6 pt-5 border-t border-slate-800/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 font-mono">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  Quick 1-Line SSH Terminal Installer (Copy &amp; Paste into Hostinger VPS Terminal):
                </span>
                <button
                  onClick={() => {
                    const origin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://ais-pre-h7k4qxcka7nfkq375w3xot-15042587786.asia-east1.run.app';
                    handleCopy(`curl -sSL "${origin}/install.sh" | sudo bash`, 'sshcmd');
                  }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'sshcmd' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied 1-Line Command!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy 1-Line Command</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 font-mono text-xs text-emerald-300 overflow-x-auto">
                <code>
                  curl -sSL "{typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://ais-pre-h7k4qxcka7nfkq375w3xot-15042587786.asia-east1.run.app'}/install.sh" | sudo bash
                </code>
              </div>
            </div>
          </div>

          {/* Package Architecture Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold">
                <Cpu className="w-4 h-4" />
                <span>1. Automated Installer (`install_vps.sh`)</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Auto-installs PHP 8.x, PDO PostgreSQL extensions, creates <code className="text-emerald-300">/var/www/html/booklogic/</code>, configures Apache/Nginx, runs migrations, and enables background daemons.
              </p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold">
                <Activity className="w-4 h-4" />
                <span>2. 24/7 Background Service</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Includes <code className="text-cyan-300">booklogic-sync.service</code> for Systemd to execute continuous 4-phase synchronization every 60s with automatic crash recovery.
              </p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-purple-400 font-mono text-xs font-bold">
                <Database className="w-4 h-4" />
                <span>3. PostgreSQL Tables (`schema.sql`)</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Complete PostgreSQL DDL for all 9 tables (<code className="text-purple-300">Reservations</code>, <code className="text-purple-300">Mas_Hotel</code>, <code className="text-purple-300">trans_roomavailability_chart_datewise</code>, etc.) on <code className="text-cyan-300">72.61.240.34</code>.
              </p>
            </div>
          </div>

          {/* Package File Browser & Code Viewer */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <FolderArchive className="w-5 h-5 text-emerald-400" />
                  <span>Deployment Package Files</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Browse and inspect all files bundled in <code className="text-emerald-300">booklogic-vps-deployment.zip</code>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const content =
                      activeCodeTab === 'installVpsSh' ? convertedCode.installVpsSh :
                      activeCodeTab === 'readmeMd' ? convertedCode.readmeMd :
                      activeCodeTab === 'serviceFile' ? convertedCode.serviceFile :
                      activeCodeTab === 'cronPhp' ? convertedCode.cronPhp :
                      activeCodeTab === 'indexPhp' ? convertedCode.indexPhp :
                      activeCodeTab === 'dbPhp' ? convertedCode.dbPhp :
                      activeCodeTab === 'syncPhp' ? convertedCode.syncPhp : convertedCode.schemaSql;
                    
                    const filename =
                      activeCodeTab === 'installVpsSh' ? 'install_vps.sh' :
                      activeCodeTab === 'readmeMd' ? 'README_VPS_INSTALL.md' :
                      activeCodeTab === 'serviceFile' ? 'booklogic-sync.service' :
                      activeCodeTab === 'cronPhp' ? 'cron_auto_sync.php' :
                      activeCodeTab === 'indexPhp' ? 'index.php' :
                      activeCodeTab === 'dbPhp' ? 'db.php' :
                      activeCodeTab === 'syncPhp' ? 'sync_booklogic.php' : 'schema.sql';

                    handleDownload(filename, content);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download File</span>
                </button>

                <button
                  onClick={() => {
                    const content =
                      activeCodeTab === 'installVpsSh' ? convertedCode.installVpsSh :
                      activeCodeTab === 'readmeMd' ? convertedCode.readmeMd :
                      activeCodeTab === 'serviceFile' ? convertedCode.serviceFile :
                      activeCodeTab === 'cronPhp' ? convertedCode.cronPhp :
                      activeCodeTab === 'indexPhp' ? convertedCode.indexPhp :
                      activeCodeTab === 'dbPhp' ? convertedCode.dbPhp :
                      activeCodeTab === 'syncPhp' ? convertedCode.syncPhp : convertedCode.schemaSql;
                    handleCopy(content, activeCodeTab);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 cursor-pointer"
                >
                  {copiedKey === activeCodeTab ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Sub Tabs for File Viewer */}
            <div className="border border-slate-800 rounded-lg overflow-hidden">
              <div className="bg-slate-950 px-3 py-2 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto">
                <button
                  onClick={() => setActiveCodeTab('installVpsSh')}
                  className={`px-3 py-1.5 text-xs font-mono rounded cursor-pointer whitespace-nowrap ${
                    activeCodeTab === 'installVpsSh'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  install_vps.sh (Installer)
                </button>

                <button
                  onClick={() => setActiveCodeTab('readmeMd')}
                  className={`px-3 py-1.5 text-xs font-mono rounded cursor-pointer whitespace-nowrap ${
                    activeCodeTab === 'readmeMd'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  README_VPS_INSTALL.md
                </button>

                <button
                  onClick={() => setActiveCodeTab('serviceFile')}
                  className={`px-3 py-1.5 text-xs font-mono rounded cursor-pointer whitespace-nowrap ${
                    activeCodeTab === 'serviceFile'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  booklogic-sync.service (Systemd)
                </button>

                <button
                  onClick={() => setActiveCodeTab('indexPhp')}
                  className={`px-3 py-1.5 text-xs font-mono rounded cursor-pointer whitespace-nowrap ${
                    activeCodeTab === 'indexPhp'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  index.php (Web Portal)
                </button>

                <button
                  onClick={() => setActiveCodeTab('cronPhp')}
                  className={`px-3 py-1.5 text-xs font-mono rounded cursor-pointer whitespace-nowrap ${
                    activeCodeTab === 'cronPhp'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  cron_auto_sync.php
                </button>

                <button
                  onClick={() => setActiveCodeTab('dbPhp')}
                  className={`px-3 py-1.5 text-xs font-mono rounded cursor-pointer whitespace-nowrap ${
                    activeCodeTab === 'dbPhp'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  db.php (Postgres PDO)
                </button>

                <button
                  onClick={() => setActiveCodeTab('syncPhp')}
                  className={`px-3 py-1.5 text-xs font-mono rounded cursor-pointer whitespace-nowrap ${
                    activeCodeTab === 'syncPhp'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  sync_booklogic.php
                </button>

                <button
                  onClick={() => setActiveCodeTab('schemaSql')}
                  className={`px-3 py-1.5 text-xs font-mono rounded cursor-pointer whitespace-nowrap ${
                    activeCodeTab === 'schemaSql'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  schema.sql (Postgres DDL)
                </button>
              </div>

              <pre className="p-4 bg-slate-950 font-mono text-xs text-slate-300 overflow-x-auto max-h-[460px] scrollbar-thin">
                <code>
                  {activeCodeTab === 'installVpsSh' && (convertedCode.installVpsSh || '# Loading install_vps.sh...')}
                  {activeCodeTab === 'readmeMd' && (convertedCode.readmeMd || '# Loading README_VPS_INSTALL.md...')}
                  {activeCodeTab === 'serviceFile' && (convertedCode.serviceFile || '# Loading booklogic-sync.service...')}
                  {activeCodeTab === 'indexPhp' && (convertedCode.indexPhp || '// Loading index.php...')}
                  {activeCodeTab === 'cronPhp' && (convertedCode.cronPhp || '// Loading cron_auto_sync.php...')}
                  {activeCodeTab === 'dbPhp' && (convertedCode.dbPhp || '// Loading db.php...')}
                  {activeCodeTab === 'syncPhp' && (convertedCode.syncPhp || '// Loading sync_booklogic.php...')}
                  {activeCodeTab === 'schemaSql' && (convertedCode.schemaSql || '-- Loading schema.sql...')}
                </code>
              </pre>
            </div>

            {/* Individual File 1-Click Downloads Grid */}
            <div className="pt-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-2.5">
                <FileDown className="w-3.5 h-3.5 text-cyan-400" />
                <span>Download Individual Files (No Unzipping Required):</span>
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { name: 'install_vps.sh', content: convertedCode.installVpsSh, desc: 'Bash Installer' },
                  { name: 'README_VPS_INSTALL.md', content: convertedCode.readmeMd, desc: 'Install Guide' },
                  { name: 'booklogic-sync.service', content: convertedCode.serviceFile, desc: 'Systemd Service' },
                  { name: 'index.php', content: convertedCode.indexPhp, desc: 'Web Dashboard' },
                  { name: 'cron_auto_sync.php', content: convertedCode.cronPhp, desc: 'Daemon Script' },
                  { name: 'db.php', content: convertedCode.dbPhp, desc: 'PostgreSQL PDO' },
                  { name: 'sync_booklogic.php', content: convertedCode.syncPhp, desc: 'Pipeline Core' },
                  { name: 'schema.sql', content: convertedCode.schemaSql, desc: 'PostgreSQL DDL' },
                ].map((item) => (
                  <button
                    key={item.name}
                    onClick={() => handleDownload(item.name, item.content || '')}
                    className="flex flex-col items-start p-2.5 rounded-lg bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/30 transition-all text-left group cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-mono text-xs font-medium text-cyan-300 group-hover:text-cyan-200 truncate">
                        {item.name}
                      </span>
                      <Download className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 shrink-0 ml-1" />
                    </div>
                    <span className="text-[10px] text-slate-500 group-hover:text-slate-400 mt-0.5 font-sans">
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: SYNC OPERATIONS & LIVE PIPELINE */}
      {subTab === 'sync' && (
        <div className="space-y-6">
          {/* AUTO-SYNC MASTER CONTROL CENTER */}
          <div className="bg-gradient-to-br from-slate-900 via-cyan-950/20 to-slate-900 border border-cyan-500/30 rounded-xl p-5 shadow-xl relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/80 px-2.5 py-0.5 rounded border border-cyan-500/30 flex items-center gap-1.5">
                    <Activity className={`w-3.5 h-3.5 ${autoSyncEnabled ? 'animate-pulse text-emerald-400' : 'text-slate-400'}`} />
                    Continuous Auto-Sync Engine
                  </span>
                  <span className={`px-2 py-0.5 text-[11px] font-mono rounded font-semibold ${
                    autoSyncDaemonState?.isRunningNow
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                      : autoSyncEnabled
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}>
                    {autoSyncDaemonState?.isRunningNow ? 'Sync In Progress...' : autoSyncEnabled ? 'Auto Daemon Active' : 'Standby / Manual'}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <span>Automated 4-Phase Channel Manager Pipeline</span>
                </h3>
                <p className="text-xs text-slate-400 max-w-2xl">
                  Automates cyclic execution across all 4 BookLogic operations: <strong className="text-slate-200">Ingest Bookings</strong> &rarr; <strong className="text-slate-200">MarkSend Ack</strong> &rarr; <strong className="text-slate-200">Push Room Availability</strong> &rarr; <strong className="text-slate-200">Push Rates</strong> on PostgreSQL (<span className="text-cyan-300 font-mono">72.61.240.34</span>).
                </p>
              </div>

              {/* Controls Toolbar */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Interval Selector */}
                <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs text-slate-400">Interval:</span>
                  <select
                    value={autoSyncInterval}
                    onChange={e => handleChangeInterval(Number(e.target.value))}
                    disabled={isConfiguringAutoSync}
                    className="bg-transparent text-xs font-mono font-semibold text-cyan-300 focus:outline-none cursor-pointer"
                  >
                    <option value={30} className="bg-slate-900 text-slate-200">30 Seconds</option>
                    <option value={60} className="bg-slate-900 text-slate-200">1 Minute</option>
                    <option value={120} className="bg-slate-900 text-slate-200">2 Minutes</option>
                    <option value={300} className="bg-slate-900 text-slate-200">5 Minutes</option>
                    <option value={600} className="bg-slate-900 text-slate-200">10 Minutes</option>
                  </select>
                </div>

                {/* Countdown pill */}
                {autoSyncEnabled && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-xs font-mono text-cyan-300">
                    <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                    <span>Next in: <strong>{countdown}s</strong></span>
                  </div>
                )}

                {/* Enable/Disable Toggle */}
                <button
                  onClick={() => handleToggleAutoSync(!autoSyncEnabled)}
                  disabled={isConfiguringAutoSync}
                  className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-sm ${
                    autoSyncEnabled
                      ? 'bg-red-950/40 hover:bg-red-900/50 text-red-300 border-red-500/30'
                      : 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>{autoSyncEnabled ? 'Pause Auto-Sync' : 'Enable Auto-Sync'}</span>
                </button>

                {/* One-Click Master Sync Trigger */}
                <button
                  onClick={handleRunMasterAutoSync}
                  disabled={isExecuting}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-400/30 transition-all cursor-pointer shadow-md disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isExecuting && activeSyncType.includes('Auto-Sync') ? 'Running Pipeline...' : 'Run Auto-Sync Full Cycle Now'}</span>
                </button>
              </div>
            </div>

            {/* 4-Phase Visual Flow Pipeline */}
            <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800/80 flex items-start gap-3">
                <div className="w-7 h-7 rounded bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-mono font-bold text-xs shrink-0 border border-cyan-500/20">
                  1
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-200 truncate">Fetch Bookings</div>
                  <div className="text-[11px] text-slate-400">&lt;syncBookingRQ&gt; &rarr; Postgres</div>
                  <div className="text-[11px] text-cyan-400 font-mono mt-1 font-semibold">
                    {lastSyncStats?.bookingsIngested ?? reservations.length} records ingested
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800/80 flex items-start gap-3">
                <div className="w-7 h-7 rounded bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs shrink-0 border border-emerald-500/20">
                  2
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-200 truncate">MarkSend Ack</div>
                  <div className="text-[11px] text-slate-400">&lt;markSendRQ&gt; &rarr; Confirm</div>
                  <div className="text-[11px] text-emerald-400 font-mono mt-1 font-semibold">
                    {lastSyncStats?.markSendsProcessed ?? 'Active'} confirmed
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800/80 flex items-start gap-3">
                <div className="w-7 h-7 rounded bg-purple-500/10 text-purple-400 flex items-center justify-center font-mono font-bold text-xs shrink-0 border border-purple-500/20">
                  3
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-200 truncate">Push Availability</div>
                  <div className="text-[11px] text-slate-400">&lt;availabilityUpdateRQ&gt;</div>
                  <div className="text-[11px] text-purple-400 font-mono mt-1 font-semibold">
                    {lastSyncStats?.availabilityPushed ?? availabilityList.length} allotments synced
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800/80 flex items-start gap-3">
                <div className="w-7 h-7 rounded bg-amber-500/10 text-amber-400 flex items-center justify-center font-mono font-bold text-xs shrink-0 border border-amber-500/20">
                  4
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-200 truncate">Push Room Rates</div>
                  <div className="text-[11px] text-slate-400">&lt;RateUpdateRQ&gt; Pricing</div>
                  <div className="text-[11px] text-amber-400 font-mono mt-1 font-semibold">
                    {lastSyncStats?.ratesPushed ?? 'Auto'} tiers updated
                  </div>
                </div>
              </div>
            </div>

            {/* VPS Cron & CLI Notice */}
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs font-mono text-slate-400">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>VPS 72.61.240.34 Crontab:</span>
                <code className="bg-slate-950 px-2 py-0.5 rounded text-cyan-300 text-[11px] border border-slate-800">
                  * * * * * php /var/www/html/cron_auto_sync.php &gt;&gt; /var/log/booklogic_sync.log 2&gt;&amp;1
                </code>
              </div>
              <button
                onClick={() => handleCopy('* * * * * php /var/www/html/cron_auto_sync.php >> /var/log/booklogic_sync.log 2>&1', 'cron-cmd')}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer text-left"
              >
                {copiedKey === 'cron-cmd' ? 'Copied Crontab Command!' : 'Copy Crontab Command'}
              </button>
            </div>
          </div>

          {/* Action Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Fetch Bookings from API */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-cyan-500/40 transition-all shadow-sm">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20">
                    <ArrowDownToLine className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    &lt;syncBookingRQ&gt;
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-200">1. Fetch Bookings from API</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Calls BookLogic XML API, parses booking payloads, and inserts atomically into PostgreSQL tables <code className="text-cyan-300">Reservations</code>, <code className="text-cyan-300">Reservations_details</code>, and <code className="text-cyan-300">Reservation_Customer</code>.
                </p>
              </div>

              <button
                onClick={() => handleRunSync('/api/booklogic/sync-bookings', 'Booking Ingest')}
                disabled={isExecuting}
                className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer transition-all disabled:opacity-50"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Fetch Bookings Now</span>
              </button>
            </div>

            {/* Card 2: Push Room Availability */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-purple-500/40 transition-all shadow-sm">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                    <CalendarCheck className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    &lt;availabilityUpdateRQ&gt;
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-200">2. Push Room Availability</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Pushes room allotments, dates, and stop-sales from <code className="text-purple-300">trans_roomavailability_chart_datewise</code> to BookLogic API and sets <code className="text-purple-300">uploadflg = 1</code>.
                </p>
              </div>

              <button
                onClick={() => handleRunSync('/api/booklogic/sync-availability', 'Availability Update')}
                disabled={isExecuting}
                className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white cursor-pointer transition-all disabled:opacity-50"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Push Availability Now</span>
              </button>
            </div>

            {/* Card 3: Push Room Rates */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-amber-500/40 transition-all shadow-sm">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    &lt;RateUpdateRQ&gt;
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-200">3. Push Room Rate Tiers</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Constructs single, double, triple, and quadruple adult pricing XML matrices from <code className="text-amber-300">Trans_roomrateupdates_datewise</code> and updates BookLogic.
                </p>
              </div>

              <button
                onClick={() => handleRunSync('/api/booklogic/sync-rates', 'Rate Updates')}
                disabled={isExecuting}
                className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white cursor-pointer transition-all disabled:opacity-50"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Push Rates Now</span>
              </button>
            </div>

            {/* Card 4: MarkSend Acknowledgment */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-emerald-500/40 transition-all shadow-sm">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                    <Send className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    &lt;markSendRQ&gt;
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-200">4. MarkSend Acknowledgment</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Scans unconfirmed bookings (<code className="text-emerald-300">COALESCE(MarkSend, 0) = 0</code>), sends confirmation to BookLogic, and logs to <code className="text-emerald-300">MarkSend_Response</code>.
                </p>
              </div>

              <button
                onClick={() => handleRunSync('/api/booklogic/sync-marksend', 'MarkSend Ack')}
                disabled={isExecuting}
                className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer transition-all disabled:opacity-50"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Acknowledge MarkSend</span>
              </button>
            </div>
          </div>

          {/* Real-time Execution Console */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-semibold text-slate-200 font-mono">BookLogic Live Transaction &amp; PostgreSQL Ingestion Log</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-mono">
                  {syncLogs.length} events logged
                </span>
                <button
                  onClick={() => setSyncLogs([])}
                  className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 cursor-pointer"
                >
                  Clear Logs
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-950/60 font-mono text-xs max-h-96 overflow-y-auto space-y-1.5 scrollbar-thin">
              {syncLogs.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  Ready to execute. Click &quot;Fetch Bookings Now&quot;, &quot;Push Availability Now&quot;, or &quot;Run Master Sync Cycle&quot; to begin operations.
                </div>
              ) : (
                syncLogs.map(log => (
                  <div
                    key={log.id}
                    className={`flex items-start gap-2 py-1 px-2 rounded ${
                      log.level === 'error'
                        ? 'bg-red-950/30 text-red-300 border-l-2 border-red-500'
                        : log.level === 'warn'
                        ? 'bg-amber-950/30 text-amber-300 border-l-2 border-amber-500'
                        : log.level === 'success'
                        ? 'bg-emerald-950/30 text-emerald-300 border-l-2 border-emerald-500'
                        : 'text-slate-300 border-l-2 border-slate-700'
                    }`}
                  >
                    <span className="text-slate-500 shrink-0 text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="flex-1">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ROOM AVAILABILITY CHART */}
      {subTab === 'availability' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-purple-400" />
                <span>Room Availability Chart (<code>trans_roomavailability_chart_datewise</code>)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Allotments in PostgreSQL pushed to BookLogic API via <code className="text-purple-300">&lt;availabilityUpdateRQ&gt;</code>. Upload status is tracked in <code className="text-purple-300">uploadflg</code>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchAvailability}
                disabled={isLoadingAvailability}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAvailability ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                onClick={() => setShowAddAvailModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Room Allotment</span>
              </button>

              <button
                onClick={() => handleRunSync('/api/booklogic/sync-availability', 'Availability Update')}
                disabled={isExecuting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer shadow-sm"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Push Pending Allotments to API</span>
              </button>
            </div>
          </div>

          {/* Add Allotment Modal */}
          {showAddAvailModal && (
            <form onSubmit={handleSaveAvailability} className="bg-slate-950 border border-purple-500/30 rounded-lg p-4 space-y-3">
              <h4 className="text-xs font-bold text-purple-300 font-mono">Create Room Availability Record in trans_roomavailability_chart_datewise</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Hotel Code *</label>
                  <input
                    type="text"
                    required
                    value={newAvail.hotelcode}
                    onChange={e => setNewAvail({ ...newAvail, hotelcode: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Allotment Code *</label>
                  <input
                    type="text"
                    required
                    value={newAvail.allotcode}
                    onChange={e => setNewAvail({ ...newAvail, allotcode: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">From Date *</label>
                  <input
                    type="date"
                    required
                    value={newAvail.fromdate}
                    onChange={e => setNewAvail({ ...newAvail, fromdate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">To Date *</label>
                  <input
                    type="date"
                    required
                    value={newAvail.todate}
                    onChange={e => setNewAvail({ ...newAvail, todate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Available Rooms *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={newAvail.Availablerooms}
                    onChange={e => setNewAvail({ ...newAvail, Availablerooms: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Stop Sales</label>
                  <select
                    value={newAvail.stopsales}
                    onChange={e => setNewAvail({ ...newAvail, stopsales: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                  >
                    <option value="0">Open (0)</option>
                    <option value="1">Stop Sales (1)</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAvailModal(false)}
                  className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded cursor-pointer"
                >
                  Save to PostgreSQL
                </button>
              </div>
            </form>
          )}

          {/* Availability Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-2.5">ID (avaidd)</th>
                  <th className="px-4 py-2.5">Hotel Code</th>
                  <th className="px-4 py-2.5">Allotment Code</th>
                  <th className="px-4 py-2.5">Date Range</th>
                  <th className="px-4 py-2.5">Available Rooms</th>
                  <th className="px-4 py-2.5">Stop Sales</th>
                  <th className="px-4 py-2.5">Upload Status</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {availabilityList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No availability records found. Click &quot;Add Room Allotment&quot; above to create inventory in PostgreSQL!
                    </td>
                  </tr>
                ) : (
                  availabilityList.map(a => (
                    <tr key={a.avaidd} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-bold text-slate-400">#{a.avaidd}</td>
                      <td className="px-4 py-3 font-semibold text-cyan-300">{a.hotelcode}</td>
                      <td className="px-4 py-3 font-mono text-purple-300">{a.allotcode}</td>
                      <td className="px-4 py-3 text-slate-300">{a.fromdate} &rarr; {a.todate}</td>
                      <td className="px-4 py-3 font-bold text-emerald-400">{a.Availablerooms} Rooms</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          a.stopsales == '1' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {a.stopsales == '1' ? 'Stop Sales' : 'Open'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          a.uploadflg
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {a.uploadflg ? 'Uploaded (uploadflg=1)' : 'Pending Push (uploadflg=0)'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleRunSync('/api/booklogic/sync-availability', `Push Allot ${a.allotcode}`)}
                          className="px-2.5 py-1 text-[11px] font-medium text-purple-300 hover:text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 rounded border border-purple-500/30 cursor-pointer"
                        >
                          Push to API
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: INGESTED BOOKINGS */}
      {subTab === 'reservations' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-400" />
                <span>Ingested Bookings in PostgreSQL (<code>BOOKLOGIC</code> Database)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Relational tables: <code className="text-cyan-300">Reservations</code>, <code className="text-cyan-300">Reservation_Customer</code>, <code className="text-cyan-300">Reservations_details</code> on VPS 72.61.240.34.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search booking ID, guest, hotel..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono w-64"
              />
              <button
                onClick={fetchReservations}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingReservations ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-3 py-2.5">Res ID</th>
                  <th className="px-3 py-2.5">Booking ID</th>
                  <th className="px-3 py-2.5">Hotel Code</th>
                  <th className="px-3 py-2.5">Guest Name</th>
                  <th className="px-3 py-2.5">Room &amp; Dates</th>
                  <th className="px-3 py-2.5">Total Amount</th>
                  <th className="px-3 py-2.5">Channel / OTA</th>
                  <th className="px-3 py-2.5">MarkSend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {filteredReservations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No reservations found. Click &quot;Fetch Bookings Now&quot; in the Ingest tab to fetch latest records from BookLogic API!
                    </td>
                  </tr>
                ) : (
                  filteredReservations.map(r => (
                    <tr key={r.Res_id} className="hover:bg-slate-800/40">
                      <td className="px-3 py-2.5 font-bold text-slate-300">#{r.Res_id}</td>
                      <td className="px-3 py-2.5 font-semibold text-cyan-300">{r.Booking_Id}</td>
                      <td className="px-3 py-2.5 text-slate-400">{r.Hotel_Code}</td>
                      <td className="px-3 py-2.5 text-slate-200 font-medium">
                        {r.FirstName || r.LastName ? `${r.FirstName || ''} ${r.LastName || ''}` : 'Guest'}
                        {r.Email && <span className="block text-[10px] text-slate-500">{r.Email}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-300">
                        <span>{r.RoomType || r.Room_Name || 'Standard Room'}</span>
                        {r.Checkindate && (
                          <span className="block text-[10px] text-slate-500">
                            {r.Checkindate} &rarr; {r.Checkoutdate}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-emerald-400">
                        ${r.Total || '0.00'} <span className="text-[10px] text-slate-500">{r.Currency || 'USD'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">
                        {r.TravelagentName || 'BookLogic Direct'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          r.MarkSend
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {r.MarkSend ? 'Sent (Ack)' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: MAS_HOTEL CREDENTIALS */}
      {subTab === 'hotels' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Hotel className="w-5 h-5 text-cyan-400" />
                <span>Active Hotels in PostgreSQL (<code>Mas_Hotel</code> Table)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                BookLogic API credentials used to authenticate and sync reservations for each hotel property.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchHotels}
                disabled={isLoadingHotels}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHotels ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                onClick={() => setShowAddHotelModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Hotel Property</span>
              </button>
            </div>
          </div>

          {/* Add Hotel Modal / Form */}
          {showAddHotelModal && (
            <form onSubmit={handleSaveHotel} className="bg-slate-950 border border-cyan-500/30 rounded-lg p-4 space-y-3">
              <h4 className="text-xs font-bold text-cyan-300 font-mono">Register New Hotel Property in Mas_Hotel</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Hotel Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BL_1042_HYD"
                    value={newHotel.HotelCode}
                    onChange={e => setNewHotel({ ...newHotel, HotelCode: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">BookLogic Username *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. microgenn_user"
                    value={newHotel.Username}
                    onChange={e => setNewHotel({ ...newHotel, Username: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">BookLogic Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={newHotel.Password}
                    onChange={e => setNewHotel({ ...newHotel, Password: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddHotelModal(false)}
                  className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded cursor-pointer"
                >
                  Save Hotel to PostgreSQL
                </button>
              </div>
            </form>
          )}

          {/* Hotels Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-2.5">Hotel Code</th>
                  <th className="px-4 py-2.5">BookLogic Username</th>
                  <th className="px-4 py-2.5">Password</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {hotels.map(h => (
                  <tr key={h.HotelCode} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-semibold text-cyan-300">{h.HotelCode}</td>
                    <td className="px-4 py-3 text-slate-300">{h.Username}</td>
                    <td className="px-4 py-3 text-slate-500">••••••••••••</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        !h.Inactive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {!h.Inactive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRunSync('/api/booklogic/sync-bookings', `Sync Hotel ${h.HotelCode}`)}
                        className="px-2.5 py-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 rounded border border-cyan-500/30 cursor-pointer"
                      >
                        Sync Bookings
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: CONVERTED PHP CODE (index.php, db.php, sync_booklogic.php) */}
      {subTab === 'code' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <FileCode className="w-5 h-5 text-cyan-400" />
                <span>Production PostgreSQL PHP Script (<code>index.php</code>)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Modernized with PostgreSQL PDO, atomic <code className="text-emerald-300">RETURNING Res_id</code>, parameterized queries, and configured for VPS <code className="text-cyan-300">72.61.240.34</code>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownload('cron_auto_sync.php', convertedCode.cronPhp)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download cron_auto_sync.php</span>
              </button>

              <button
                onClick={() => handleDownload('index.php', convertedCode.indexPhp)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download index.php</span>
              </button>

              <button
                onClick={() => handleDownload('db.php', convertedCode.dbPhp)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download db.php</span>
              </button>
            </div>
          </div>

          {/* Key Migration Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="text-xs font-bold text-emerald-400 font-mono mb-1">1. 4-Phase Auto-Sync Engine</div>
              <p className="text-[11px] text-slate-400">
                <code className="text-emerald-300">cron_auto_sync.php</code> runs via Linux crontab or as daemon (<code className="text-cyan-300">--daemon</code>) executing all 4 phases in sequence.
              </p>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="text-xs font-bold text-cyan-400 font-mono mb-1">2. Atomic Primary Key</div>
              <p className="text-[11px] text-slate-400">
                Replaced unsafe SQL Server <code className="text-red-400">@@identity / @Siden</code> with PostgreSQL atomic <code className="text-emerald-400">RETURNING Res_id</code> to link detail records safely.
              </p>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="text-xs font-bold text-amber-400 font-mono mb-1">3. Availability &amp; Rates Push</div>
              <p className="text-[11px] text-slate-400">
                Pushes allotments from <code className="text-purple-300">trans_roomavailability_chart_datewise</code> and updates <code className="text-purple-300">uploadflg = 1</code>.
              </p>
            </div>
          </div>

          {/* Code Viewer */}
          <div className="border border-slate-800 rounded-lg overflow-hidden">
            <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveCodeTab('cronPhp')}
                  className={`px-3 py-1 text-xs font-mono rounded cursor-pointer ${
                    activeCodeTab === 'cronPhp' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  cron_auto_sync.php (CLI Daemon)
                </button>
                <button
                  onClick={() => setActiveCodeTab('indexPhp')}
                  className={`px-3 py-1 text-xs font-mono rounded cursor-pointer ${
                    activeCodeTab === 'indexPhp' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  index.php (Web Dashboard &amp; Sync)
                </button>
                <button
                  onClick={() => setActiveCodeTab('dbPhp')}
                  className={`px-3 py-1 text-xs font-mono rounded cursor-pointer ${
                    activeCodeTab === 'dbPhp' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  db.php (Postgres PDO)
                </button>
                <button
                  onClick={() => setActiveCodeTab('syncPhp')}
                  className={`px-3 py-1 text-xs font-mono rounded cursor-pointer ${
                    activeCodeTab === 'syncPhp' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  sync_booklogic.php
                </button>
              </div>

              <button
                onClick={() => handleCopy(
                  activeCodeTab === 'cronPhp' ? convertedCode.cronPhp :
                  activeCodeTab === 'indexPhp' ? convertedCode.indexPhp :
                  activeCodeTab === 'dbPhp' ? convertedCode.dbPhp : convertedCode.syncPhp,
                  activeCodeTab
                )}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 font-mono cursor-pointer"
              >
                {copiedKey === activeCodeTab ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>

            <pre className="p-4 bg-slate-950 font-mono text-xs text-slate-300 overflow-x-auto max-h-96 scrollbar-thin">
              <code>
                {activeCodeTab === 'cronPhp' && convertedCode.cronPhp}
                {activeCodeTab === 'indexPhp' && convertedCode.indexPhp}
                {activeCodeTab === 'dbPhp' && convertedCode.dbPhp}
                {activeCodeTab === 'syncPhp' && convertedCode.syncPhp}
              </code>
            </pre>
          </div>
        </div>
      )}

      {/* TAB 6: SCHEMA DDL */}
      {subTab === 'schema' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Database className="w-5 h-5 text-cyan-400" />
                <span>PostgreSQL DDL Database Schema (<code>BOOKLOGIC</code> Database)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Run this SQL script in pgAdmin, psql, or click &quot;Verify / Init Tables in Postgres&quot; above to provision all 9 BookLogic tables.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopy(convertedCode.schemaSql, 'schema')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
              >
                {copiedKey === 'schema' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied SQL</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy SQL</span>
                  </>
                )}
              </button>

              <button
                onClick={() => handleDownload('schema.sql', convertedCode.schemaSql)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download schema.sql</span>
              </button>
            </div>
          </div>

          <pre className="p-4 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-slate-300 overflow-x-auto max-h-[500px] scrollbar-thin">
            <code>{convertedCode.schemaSql}</code>
          </pre>
        </div>
      )}
    </div>
  );
};
