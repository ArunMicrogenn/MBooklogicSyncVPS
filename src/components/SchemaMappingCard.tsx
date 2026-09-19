import React, { useState } from 'react';
import { 
  Table2, 
  Key, 
  Plus, 
  Trash2, 
  Code2, 
  Check, 
  Copy, 
  Wand2, 
  Eye, 
  EyeOff,
  Sparkles
} from 'lucide-react';
import { FieldMapping, PostgresColumnType } from '../types';

interface SchemaMappingCardProps {
  fieldMappings: FieldMapping[];
  setFieldMappings: React.Dispatch<React.SetStateAction<FieldMapping[]>>;
  tableName: string;
  onAutoDetect: () => void;
  hasDetectedFields: boolean;
}

const POSTGRES_TYPES: PostgresColumnType[] = [
  'TEXT',
  'VARCHAR(255)',
  'INTEGER',
  'BIGINT',
  'NUMERIC(12,2)',
  'BOOLEAN',
  'TIMESTAMP WITH TIME ZONE',
  'JSONB',
  'UUID',
];

export const SchemaMappingCard: React.FC<SchemaMappingCardProps> = ({
  fieldMappings,
  setFieldMappings,
  tableName,
  onAutoDetect,
  hasDetectedFields,
}) => {
  const [showSqlPreview, setShowSqlPreview] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const updateMapping = (index: number, field: keyof FieldMapping, val: any) => {
    setFieldMappings(prev => {
      const updated = [...prev];
      if (field === 'isPrimaryKey' && val === true) {
        // Only one primary key allowed
        updated.forEach(m => { m.isPrimaryKey = false; });
      }
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  const addColumn = () => {
    setFieldMappings(prev => [
      ...prev,
      {
        apiKey: `custom_field_${prev.length + 1}`,
        columnName: `custom_col_${prev.length + 1}`,
        columnType: 'TEXT',
        isPrimaryKey: false,
        isNullable: true,
        transformFunction: 'none',
        selected: true,
      },
    ]);
  };

  const removeColumn = (index: number) => {
    setFieldMappings(prev => prev.filter((_, i) => i !== index));
  };

  const selectAll = (selected: boolean) => {
    setFieldMappings(prev => prev.map(m => ({ ...m, selected })));
  };

  // Generate DDL SQL
  const activeColumns = fieldMappings.filter(m => m.selected);
  const generatedSql = `-- Generated PostgreSQL DDL for table: ${tableName || 'api_records'}
CREATE TABLE IF NOT EXISTS "${(tableName || 'api_records').replace(/[^a-zA-Z0-9_]/g, '_')}" (
${activeColumns.map(m => {
  let def = `  "${m.columnName}" ${m.columnType}`;
  if (m.isPrimaryKey) def += ' PRIMARY KEY';
  else if (!m.isNullable) def += ' NOT NULL';
  if (m.defaultValue) def += ` DEFAULT ${m.defaultValue}`;
  return def;
}).join(',\n')}
);`;

  const copySql = () => {
    navigator.clipboard.writeText(generatedSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div id="schema-mapping-card" className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold text-xs">
            3
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Table2 className="w-4 h-4 text-indigo-400" />
              Schema & Column Transformation Mapping
            </h2>
            <p className="text-xs text-slate-400">Map JSON API attributes to PostgreSQL column types and primary keys</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {hasDetectedFields && (
            <button
              type="button"
              onClick={onAutoDetect}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Reset Auto-Detect</span>
            </button>
          )}

          <button
            type="button"
            onClick={addColumn}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Column</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSqlPreview(!showSqlPreview)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-cyan-300 border border-slate-700 hover:bg-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>{showSqlPreview ? 'Hide SQL DDL' : 'View SQL DDL'}</span>
          </button>
        </div>
      </div>

      {/* SQL Preview Collapsible */}
      {showSqlPreview && (
        <div className="mt-4 p-3 bg-slate-950 rounded-lg border border-slate-800 relative">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs text-slate-400 font-mono">
            <span>PostgreSQL Table DDL Definition:</span>
            <button
              onClick={copySql}
              className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-xs cursor-pointer"
            >
              {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSql ? 'Copied!' : 'Copy SQL'}</span>
            </button>
          </div>
          <pre className="text-xs font-mono text-cyan-300 overflow-x-auto leading-relaxed">
            {generatedSql}
          </pre>
        </div>
      )}

      {/* Mapping Table */}
      <div className="mt-4">
        {fieldMappings.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl">
            <Table2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No schema fields mapped yet.</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Click <strong>Fetch & Test API</strong> above to automatically discover fields, or manually click <strong>Add Column</strong>.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-mono">
                <tr>
                  <th className="p-2.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={fieldMappings.every(m => m.selected)}
                      onChange={(e) => selectAll(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-cyan-500 cursor-pointer"
                      title="Select all"
                    />
                  </th>
                  <th className="p-2.5">API JSON Key</th>
                  <th className="p-2.5">Postgres Column Name</th>
                  <th className="p-2.5">Data Type</th>
                  <th className="p-2.5 text-center">Primary Key</th>
                  <th className="p-2.5">Transform / Cast</th>
                  <th className="p-2.5 w-10 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {fieldMappings.map((map, idx) => (
                  <tr 
                    key={idx}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      !map.selected ? 'opacity-50 bg-slate-950/30' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="p-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={map.selected}
                        onChange={(e) => updateMapping(idx, 'selected', e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-cyan-500 cursor-pointer"
                      />
                    </td>

                    {/* API Key */}
                    <td className="p-2.5">
                      <input
                        type="text"
                        value={map.apiKey}
                        onChange={(e) => updateMapping(idx, 'apiKey', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                      />
                    </td>

                    {/* Postgres Column Name */}
                    <td className="p-2.5">
                      <input
                        type="text"
                        value={map.columnName}
                        onChange={(e) => updateMapping(idx, 'columnName', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 text-teal-300 font-bold text-xs rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
                      />
                    </td>

                    {/* Column Type */}
                    <td className="p-2.5">
                      <select
                        value={map.columnType}
                        onChange={(e) => updateMapping(idx, 'columnType', e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        {POSTGRES_TYPES.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </td>

                    {/* Primary Key Radio */}
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => updateMapping(idx, 'isPrimaryKey', !map.isPrimaryKey)}
                        className={`p-1 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center ${
                          map.isPrimaryKey 
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' 
                            : 'text-slate-600 hover:text-slate-400'
                        }`}
                        title={map.isPrimaryKey ? 'Primary Key (Used for Upsert conflict matching)' : 'Set as Primary Key'}
                      >
                        <Key className="w-3.5 h-3.5" />
                      </button>
                    </td>

                    {/* Transform */}
                    <td className="p-2.5">
                      <select
                        value={map.transformFunction || 'none'}
                        onChange={(e) => updateMapping(idx, 'transformFunction', e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-700 text-slate-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-indigo-500 cursor-pointer font-sans"
                      >
                        <option value="none">None (Direct)</option>
                        <option value="json_stringify">JSON.stringify</option>
                        <option value="to_number">Cast Number</option>
                        <option value="to_boolean">Cast Boolean</option>
                        <option value="lowercase">Lowercase</option>
                        <option value="uppercase">Uppercase</option>
                        <option value="trim">Trim Whitespace</option>
                      </select>
                    </td>

                    {/* Remove */}
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeColumn(idx)}
                        className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer transition-colors"
                        title="Remove column"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
          <span>{activeColumns.length} of {fieldMappings.length} columns selected for insertion</span>
          <span className="text-amber-400/90 flex items-center gap-1 font-mono">
            <Key className="w-3 h-3" />
            {fieldMappings.find(m => m.isPrimaryKey)?.columnName ? `PK: ${fieldMappings.find(m => m.isPrimaryKey)?.columnName}` : 'No PK selected'}
          </span>
        </div>
      </div>
    </div>
  );
};
