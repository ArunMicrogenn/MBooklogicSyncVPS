import React, { useState } from 'react';
import { 
  Globe, 
  Send, 
  Key, 
  Plus, 
  Trash2, 
  ChevronDown, 
  ChevronRight, 
  FileJson, 
  Layers, 
  Sparkles,
  CheckCircle,
  AlertCircle,
  Clock,
  Code
} from 'lucide-react';
import { ApiConfig, ApiHeader, HttpMethod } from '../types';
import { PRESET_TEMPLATES } from '../data/presets';

interface ApiSourceCardProps {
  apiConfig: ApiConfig;
  setApiConfig: React.Dispatch<React.SetStateAction<ApiConfig>>;
  onFetchApi: () => void;
  isFetching: boolean;
  fetchResult: any;
  onApplyPreset: (presetIndex: number) => void;
}

export const ApiSourceCard: React.FC<ApiSourceCardProps> = ({
  apiConfig,
  setApiConfig,
  onFetchApi,
  isFetching,
  fetchResult,
  onApplyPreset,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showResponsePreview, setShowResponsePreview] = useState(true);

  const addHeader = () => {
    setApiConfig(prev => ({
      ...prev,
      headers: [...prev.headers, { key: '', value: '', enabled: true }],
    }));
  };

  const updateHeader = (index: number, field: keyof ApiHeader, val: any) => {
    setApiConfig(prev => {
      const updated = [...prev.headers];
      updated[index] = { ...updated[index], [field]: val };
      return { ...prev, headers: updated };
    });
  };

  const removeHeader = (index: number) => {
    setApiConfig(prev => ({
      ...prev,
      headers: prev.headers.filter((_, i) => i !== index),
    }));
  };

  return (
    <div id="api-source-card" className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-xs">
            1
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              Source API Configuration
            </h2>
            <p className="text-xs text-slate-400">Specify the REST API endpoint and response extraction path</p>
          </div>
        </div>

        {/* Preset Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Presets:
          </span>
          <select
            id="preset-api-select"
            onChange={(e) => {
              if (e.target.value !== '') {
                onApplyPreset(Number(e.target.value));
              }
            }}
            defaultValue=""
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="" disabled>Load Example API...</option>
            {PRESET_TEMPLATES.map((tpl, i) => (
              <option key={tpl.name} value={i}>
                {tpl.name} ({tpl.category})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Endpoint Bar */}
      <div className="mt-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Method selector */}
          <select
            id="api-method-select"
            value={apiConfig.method}
            onChange={(e) => setApiConfig(prev => ({ ...prev, method: e.target.value as HttpMethod }))}
            className="bg-slate-800 border border-slate-700 text-cyan-400 font-mono font-bold text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-cyan-500 cursor-pointer sm:w-28"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>

          {/* URL Input */}
          <div className="flex-1 relative">
            <input
              id="api-url-input"
              type="text"
              value={apiConfig.url}
              onChange={(e) => setApiConfig(prev => ({ ...prev, url: e.target.value }))}
              placeholder="https://api.example.com/v1/records"
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
            />
          </div>

          {/* Fetch Button */}
          <button
            id="fetch-api-records-btn"
            onClick={onFetchApi}
            disabled={isFetching || !apiConfig.url}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-md shadow-cyan-600/20 active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {isFetching ? (
              <>
                <Clock className="w-3.5 h-3.5 animate-spin" />
                <span>Fetching...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Fetch & Test API</span>
              </>
            )}
          </button>
        </div>

        {/* Data Path & Quick Auth */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                JSON Array Data Path
              </span>
              <span className="text-[11px] text-slate-500 font-mono">(optional root path)</span>
            </label>
            <input
              id="api-data-path-input"
              type="text"
              value={apiConfig.dataPath || ''}
              onChange={(e) => setApiConfig(prev => ({ ...prev, dataPath: e.target.value }))}
              placeholder="e.g. products or data.items (blank if array is top-level)"
              className="w-full bg-slate-950 border border-slate-700/90 text-slate-200 font-mono text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              Authentication Method
            </label>
            <select
              id="api-auth-type-select"
              value={apiConfig.authType}
              onChange={(e) => setApiConfig(prev => ({ ...prev, authType: e.target.value as any }))}
              className="w-full bg-slate-950 border border-slate-700/90 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="none">No Auth (Public API)</option>
              <option value="bearer">Bearer Token (Header Authorization)</option>
              <option value="apikey">API Key (Custom Header / Query Param)</option>
              <option value="basic">Basic Auth (Username & Password)</option>
            </select>
          </div>
        </div>

        {/* Auth Sub-panels */}
        {apiConfig.authType === 'bearer' && (
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-2">
            <label className="block text-xs text-slate-400">Bearer Token</label>
            <input
              id="auth-bearer-token"
              type="password"
              value={apiConfig.bearerToken || ''}
              onChange={(e) => setApiConfig(prev => ({ ...prev, bearerToken: e.target.value }))}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 font-mono text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-cyan-500"
            />
          </div>
        )}

        {apiConfig.authType === 'apikey' && (
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Key Name</label>
              <input
                id="auth-apikey-name"
                type="text"
                value={apiConfig.apiKeyName || ''}
                onChange={(e) => setApiConfig(prev => ({ ...prev, apiKeyName: e.target.value }))}
                placeholder="X-API-Key or api_key"
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 font-mono text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Key Value</label>
              <input
                id="auth-apikey-value"
                type="password"
                value={apiConfig.apiKeyValue || ''}
                onChange={(e) => setApiConfig(prev => ({ ...prev, apiKeyValue: e.target.value }))}
                placeholder="secret_key_..."
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 font-mono text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Send In</label>
              <select
                id="auth-apikey-location"
                value={apiConfig.apiKeyIn || 'header'}
                onChange={(e) => setApiConfig(prev => ({ ...prev, apiKeyIn: e.target.value as any }))}
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-cyan-500"
              >
                <option value="header">HTTP Header</option>
                <option value="query">URL Query Parameter</option>
              </select>
            </div>
          </div>
        )}

        {apiConfig.authType === 'basic' && (
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Username</label>
              <input
                id="auth-basic-user"
                type="text"
                value={apiConfig.basicUser || ''}
                onChange={(e) => setApiConfig(prev => ({ ...prev, basicUser: e.target.value }))}
                placeholder="admin"
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 font-mono text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Password</label>
              <input
                id="auth-basic-pass"
                type="password"
                value={apiConfig.basicPass || ''}
                onChange={(e) => setApiConfig(prev => ({ ...prev, basicPass: e.target.value }))}
                placeholder="••••••••"
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 font-mono text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        )}

        {/* Toggle Advanced Headers / POST body */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1 font-mono transition-colors cursor-pointer"
          >
            {showAdvanced ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span>{showAdvanced ? 'Hide Custom Headers & POST Payload' : 'Configure Custom Headers & POST Payload'}</span>
            {apiConfig.headers.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-slate-800 text-cyan-400 rounded-full text-[10px]">
                {apiConfig.headers.length} headers
              </span>
            )}
          </button>

          {showAdvanced && (
            <div className="mt-3 p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-3">
              {/* Custom Headers */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-300">Custom HTTP Headers</span>
                  <button
                    type="button"
                    onClick={addHeader}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Header
                  </button>
                </div>

                {apiConfig.headers.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No custom headers defined.</p>
                ) : (
                  <div className="space-y-2">
                    {apiConfig.headers.map((hdr, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={hdr.enabled}
                          onChange={(e) => updateHeader(idx, 'enabled', e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                        />
                        <input
                          type="text"
                          placeholder="Header Key (e.g. User-Agent)"
                          value={hdr.key}
                          onChange={(e) => updateHeader(idx, 'key', e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 font-mono text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
                        />
                        <input
                          type="text"
                          placeholder="Value"
                          value={hdr.value}
                          onChange={(e) => updateHeader(idx, 'value', e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 font-mono text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          type="button"
                          onClick={() => removeHeader(idx)}
                          className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* POST Payload */}
              {apiConfig.method === 'POST' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">POST Request Body (JSON)</label>
                  <textarea
                    rows={3}
                    value={apiConfig.bodyPayload || ''}
                    onChange={(e) => setApiConfig(prev => ({ ...prev, bodyPayload: e.target.value }))}
                    placeholder={`{\n  "query": "active",\n  "page": 1\n}`}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 font-mono text-xs rounded-lg p-2.5 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live Fetch Results Preview */}
        {fetchResult && (
          <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-cyan-500/20">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-200">
                  Fetched {fetchResult.totalRecords} Records
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[11px] font-mono">
                  HTTP {fetchResult.statusCode}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[11px] font-mono">
                  {fetchResult.durationMs}ms
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowResponsePreview(!showResponsePreview)}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 cursor-pointer"
              >
                <Code className="w-3.5 h-3.5" />
                {showResponsePreview ? 'Collapse Sample' : 'View Sample Record'}
              </button>
            </div>

            {showResponsePreview && (
              <div className="mt-3">
                <div className="text-[11px] text-slate-400 font-mono mb-1.5 flex items-center justify-between">
                  <span>Sample Record (1 of {fetchResult.totalRecords}):</span>
                  <span>{fetchResult.detectedFields?.length || 0} fields detected</span>
                </div>
                <pre className="bg-slate-950/90 text-cyan-300 font-mono text-xs p-3 rounded-lg overflow-x-auto max-h-48 border border-slate-800 leading-relaxed">
                  {JSON.stringify(fetchResult.sampleRecord || fetchResult.records?.[0] || {}, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
