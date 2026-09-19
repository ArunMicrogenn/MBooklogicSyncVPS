import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { BookLogicSyncSuite } from './components/BookLogicSyncSuite';
import { ApiSourceCard } from './components/ApiSourceCard';
import { PostgresTargetCard } from './components/PostgresTargetCard';
import { SchemaMappingCard } from './components/SchemaMappingCard';
import { SyncExecutionPanel } from './components/SyncExecutionPanel';
import { DatabaseExplorer } from './components/DatabaseExplorer';
import { ScriptGenerator } from './components/ScriptGenerator';
import { HistoryScheduler } from './components/HistoryScheduler';
import { ApiConfig, PostgresConfig, FieldMapping, SyncExecutionResult } from './types';
import { PRESET_TEMPLATES } from './data/presets';

export default function App() {
  const [activeTab, setActiveTab] = useState<'booklogic' | 'pipeline' | 'explorer' | 'scripts' | 'history'>('booklogic');

  // API Config State (Initialized with first preset)
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    url: PRESET_TEMPLATES[0].url,
    method: PRESET_TEMPLATES[0].method,
    headers: [
      { key: 'Accept', value: 'application/json', enabled: true },
    ],
    authType: 'none',
    dataPath: PRESET_TEMPLATES[0].dataPath,
  });

  // PostgreSQL VPS Config State (Pre-configured for VPS 72.61.240.34, database BOOKLOGIC)
  const [pgConfig, setPgConfig] = useState<PostgresConfig>({
    connectionMode: 'parameters',
    host: '72.61.240.34',
    port: 5432,
    database: 'BOOKLOGIC',
    user: 'postgres',
    password: 'mgenn',
    ssl: 'prefer',
    tableName: 'Reservations',
    createTableIfNotExists: true,
    conflictMode: 'upsert',
    primaryKeyColumn: 'Res_id',
    batchSize: 100,
  });

  // Field Mappings
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([
    { apiKey: 'id', columnName: 'id', columnType: 'INTEGER', isPrimaryKey: true, isNullable: false, transformFunction: 'to_number', selected: true },
    { apiKey: 'title', columnName: 'title', columnType: 'VARCHAR(255)', isPrimaryKey: false, isNullable: true, transformFunction: 'none', selected: true },
    { apiKey: 'price', columnName: 'price', columnType: 'NUMERIC(12,2)', isPrimaryKey: false, isNullable: true, transformFunction: 'to_number', selected: true },
    { apiKey: 'category', columnName: 'category', columnType: 'VARCHAR(255)', isPrimaryKey: false, isNullable: true, transformFunction: 'none', selected: true },
    { apiKey: 'rating', columnName: 'rating', columnType: 'NUMERIC(12,2)', isPrimaryKey: false, isNullable: true, transformFunction: 'to_number', selected: true },
    { apiKey: 'stock', columnName: 'stock', columnType: 'INTEGER', isPrimaryKey: false, isNullable: true, transformFunction: 'to_number', selected: true },
    { apiKey: 'brand', columnName: 'brand', columnType: 'VARCHAR(255)', isPrimaryKey: false, isNullable: true, transformFunction: 'none', selected: true },
    { apiKey: 'description', columnName: 'description', columnType: 'TEXT', isPrimaryKey: false, isNullable: true, transformFunction: 'none', selected: true },
  ]);

  // Operational states
  const [isFetchingApi, setIsFetchingApi] = useState(false);
  const [fetchResult, setFetchResult] = useState<any>(null);
  const [isTestingPostgres, setIsTestingPostgres] = useState(false);
  const [vpsStatus, setVpsStatus] = useState<any>({ connected: true, mode: 'sandbox', latency: 1 });
  const [isExecutingSync, setIsExecutingSync] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncExecutionResult | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [scheduledInterval, setScheduledInterval] = useState<number>(0);

  // Auto-fetch API preset on load to hydrate schema
  const handleFetchApi = async (overrideUrl?: string, overrideDataPath?: string) => {
    setIsFetchingApi(true);
    try {
      const res = await fetch('/api/fetch-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...apiConfig,
          url: overrideUrl || apiConfig.url,
          dataPath: overrideDataPath !== undefined ? overrideDataPath : apiConfig.dataPath,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFetchResult(data);
        if (data.detectedFields && data.detectedFields.length > 0) {
          setFieldMappings(data.detectedFields);
        }
      } else {
        alert(data.error || 'Failed to fetch external API');
      }
    } catch (err: any) {
      alert(err.message || 'Error communicating with API proxy');
    } finally {
      setIsFetchingApi(false);
    }
  };

  const handleApplyPreset = (index: number) => {
    const preset = PRESET_TEMPLATES[index];
    if (!preset) return;
    setApiConfig(prev => ({
      ...prev,
      url: preset.url,
      method: preset.method,
      dataPath: preset.dataPath,
      headers: preset.headers || [{ key: 'Accept', value: 'application/json', enabled: true }],
    }));
    setPgConfig(prev => ({
      ...prev,
      tableName: preset.targetTable,
      primaryKeyColumn: preset.primaryKey,
    }));
    handleFetchApi(preset.url, preset.dataPath);
  };

  const handleTestPostgres = async () => {
    setIsTestingPostgres(true);
    try {
      const res = await fetch('/api/test-postgres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pgConfig),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setVpsStatus({
          connected: true,
          mode: data.mode,
          latency: data.latencyMs,
          message: data.message,
        });
      } else {
        setVpsStatus({
          connected: false,
          error: data.error,
          hint: data.hint,
        });
      }
    } catch (err: any) {
      setVpsStatus({
        connected: false,
        error: err.message,
      });
    } finally {
      setIsTestingPostgres(false);
    }
  };

  const handleExecuteSync = async () => {
    setIsExecutingSync(true);
    try {
      const res = await fetch('/api/execute-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiConfig,
          pgConfig,
          fieldMappings,
        }),
      });
      const data = await res.json();
      setSyncResult(data);
      // Refresh history
      fetchHistory();
    } catch (err: any) {
      alert(err.message || 'Sync execution failed');
    } finally {
      setIsExecutingSync(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      if (data.history) {
        setHistory(data.history);
      }
    } catch {}
  };

  // Initial fetch history & preset records on startup
  useEffect(() => {
    fetchHistory();
    handleFetchApi();
  }, []);

  // Scheduler effect
  useEffect(() => {
    if (scheduledInterval <= 0) return;
    const intervalMs = scheduledInterval * 60 * 1000;
    const timer = setInterval(() => {
      handleExecuteSync();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [scheduledInterval, apiConfig, pgConfig, fieldMappings]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        vpsStatus={vpsStatus}
        lastSyncResult={syncResult}
        onQuickRun={handleExecuteSync}
        isRunning={isExecutingSync}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'booklogic' && (
          <BookLogicSyncSuite onNavigateToExplorer={() => setActiveTab('explorer')} />
        )}

        {activeTab === 'pipeline' && (
          <div className="space-y-6">
            {/* Step 1: API Source */}
            <ApiSourceCard
              apiConfig={apiConfig}
              setApiConfig={setApiConfig}
              onFetchApi={() => handleFetchApi()}
              isFetching={isFetchingApi}
              fetchResult={fetchResult}
              onApplyPreset={handleApplyPreset}
            />

            {/* Step 2: Postgres Target on VPS */}
            <PostgresTargetCard
              pgConfig={pgConfig}
              setPgConfig={setPgConfig}
              onTestConnection={handleTestPostgres}
              isTesting={isTestingPostgres}
              connectionTestResult={vpsStatus}
            />

            {/* Step 3: Schema Mapping & DDL */}
            <SchemaMappingCard
              fieldMappings={fieldMappings}
              setFieldMappings={setFieldMappings}
              tableName={pgConfig.tableName}
              onAutoDetect={() => {
                if (fetchResult?.detectedFields) {
                  setFieldMappings(fetchResult.detectedFields);
                }
              }}
              hasDetectedFields={Boolean(fetchResult?.detectedFields?.length)}
            />

            {/* Step 4: Execution & Batch Telemetry */}
            <SyncExecutionPanel
              onExecuteSync={handleExecuteSync}
              isExecuting={isExecutingSync}
              syncResult={syncResult}
              onViewDatabase={() => setActiveTab('explorer')}
            />
          </div>
        )}

        {activeTab === 'explorer' && (
          <DatabaseExplorer pgConfig={pgConfig} />
        )}

        {activeTab === 'scripts' && (
          <ScriptGenerator
            apiConfig={apiConfig}
            pgConfig={pgConfig}
            fieldMappings={fieldMappings}
          />
        )}

        {activeTab === 'history' && (
          <HistoryScheduler
            history={history}
            onTriggerSync={handleExecuteSync}
            isExecuting={isExecutingSync}
            scheduledInterval={scheduledInterval}
            setScheduledInterval={setScheduledInterval}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 font-mono">
          <div>API to PostgreSQL Ingestor & VPS Pipeline Studio</div>
          <div className="flex items-center gap-3">
            <span>PostgreSQL 14 / 15 / 16 +</span>
            <span>•</span>
            <span>Batch Parameterized UPSERT</span>
            <span>•</span>
            <span>Zero-Data Loss Architecture</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
