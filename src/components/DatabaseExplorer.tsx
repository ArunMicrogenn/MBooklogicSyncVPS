import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Search, 
  RefreshCw, 
  Play, 
  Download, 
  FileText, 
  Table as TableIcon, 
  ChevronLeft, 
  ChevronRight, 
  Code,
  Eye,
  X,
  Layers
} from 'lucide-react';
import { PostgresConfig } from '../types';

interface DatabaseExplorerProps {
  pgConfig: PostgresConfig;
}

export const DatabaseExplorer: React.FC<DatabaseExplorerProps> = ({ pgConfig }) => {
  const [tables, setTables] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>(pgConfig.tableName || 'api_records');
  const [customSql, setCustomSql] = useState<string>(`SELECT * FROM "${pgConfig.tableName || 'api_records'}" LIMIT 50;`);
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [totalRowCount, setTotalRowCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [inspectRow, setInspectRow] = useState<any | null>(null);

  const fetchTables = async () => {
    try {
      const res = await fetch('/api/get-tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pgConfig),
      });
      const data = await res.json();
      if (data.success && data.tables) {
        setTables(data.tables);
        if (data.tables.length > 0 && !data.tables.find((t: any) => t.tableName === selectedTable)) {
          setSelectedTable(data.tables[0].tableName);
        }
      }
    } catch {}
  };

  const executeQuery = async (sqlToRun?: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/query-postgres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: pgConfig,
          sql: sqlToRun !== undefined ? sqlToRun : customSql,
          tableName: selectedTable,
          limit: 100,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Failed to query PostgreSQL database');
        setRows([]);
        setColumns([]);
      } else {
        const fetchedRows = data.rows || [];
        setRows(fetchedRows);
        setTotalRowCount(data.rowCount || fetchedRows.length);
        if (fetchedRows.length > 0) {
          setColumns(Object.keys(fetchedRows[0]));
        } else if (data.fields) {
          setColumns(data.fields.map((f: any) => f.name));
        } else {
          setColumns([]);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error querying database');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
    executeQuery(`SELECT * FROM "${pgConfig.tableName || 'api_records'}" LIMIT 50;`);
  }, [pgConfig.tableName, pgConfig.connectionMode]);

  const handleTableSelect = (tblName: string) => {
    setSelectedTable(tblName);
    const sql = `SELECT * FROM "${tblName}" LIMIT 50;`;
    setCustomSql(sql);
    executeQuery(sql);
  };

  const filteredRows = rows.filter(r => {
    if (!searchTerm) return true;
    return JSON.stringify(r).toLowerCase().includes(searchTerm.toLowerCase());
  });

  const exportCsv = () => {
    if (rows.length === 0) return;
    const headers = columns.join(',');
    const csvContent = rows.map(r => 
      columns.map(col => {
        let cell = r[col];
        if (typeof cell === 'object' && cell !== null) cell = JSON.stringify(cell);
        const str = String(cell !== undefined && cell !== null ? cell : '').replace(/"/g, '""');
        return `"${str}"`;
      }).join(',')
    ).join('\n');

    const blob = new Blob([`${headers}\n${csvContent}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTable}_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    if (rows.length === 0) return;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTable}_export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div id="database-explorer-view" className="space-y-4">
      {/* Top Banner & SQL Editor */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-teal-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Live PostgreSQL Table & Query Explorer</h2>
              <p className="text-xs text-slate-400">
                Connected to {pgConfig.connectionMode === 'sandbox' ? 'Sandbox Database' : `${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchTables(); executeQuery(); }}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-teal-400' : ''}`} />
              <span>Refresh Tables</span>
            </button>
          </div>
        </div>

        {/* SQL Query Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <Code className="w-3.5 h-3.5 text-cyan-400" />
              Custom SQL Query:
            </span>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Quick tables:</span>
              {tables.map(t => (
                <button
                  key={t.tableName}
                  onClick={() => handleTableSelect(t.tableName)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer ${
                    selectedTable === t.tableName 
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.tableName} ({t.rowCount ?? '?'})
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={customSql}
              onChange={(e) => setCustomSql(e.target.value)}
              placeholder='SELECT * FROM "tableName" LIMIT 50;'
              className="flex-1 bg-slate-950 border border-slate-700 text-cyan-300 font-mono text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
            />
            <button
              onClick={() => executeQuery(customSql)}
              disabled={isLoading}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-md shadow-teal-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Execute SQL</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono">
          <strong>Query Error: </strong>{errorMessage}
        </div>
      )}

      {/* Table & Results View */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        {/* Table Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <TableIcon className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-slate-200">
              Table: <span className="font-mono text-cyan-300">"{selectedTable}"</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-xs font-mono">
              {totalRowCount} total records
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Search filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter table rows..."
                className="bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-cyan-500 w-48 sm:w-64"
              />
            </div>

            {/* Export buttons */}
            <button
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
              title="Export as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </button>

            <button
              onClick={exportJson}
              disabled={rows.length === 0}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
              title="Export as JSON"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">JSON</span>
            </button>
          </div>
        </div>

        {/* Data Grid */}
        <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-[500px] overflow-y-auto">
          {rows.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-teal-400" />
                  <span>Loading table records...</span>
                </div>
              ) : (
                'No rows found in this table. Run an ingestion sync to insert records.'
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/90 text-slate-300 border-b border-slate-800 font-mono sticky top-0 z-10">
                <tr>
                  <th className="p-2.5 w-10 text-center">#</th>
                  {columns.map(col => (
                    <th key={col} className="p-2.5 whitespace-nowrap text-teal-300 font-bold">
                      {col}
                    </th>
                  ))}
                  <th className="p-2.5 w-12 text-center">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                    <td className="p-2.5 text-center text-slate-600 text-[11px]">{idx + 1}</td>
                    {columns.map(col => {
                      const val = row[col];
                      const isObj = typeof val === 'object' && val !== null;
                      const displayVal = isObj ? JSON.stringify(val) : String(val ?? 'NULL');
                      const isNull = val === null || val === undefined;

                      return (
                        <td key={col} className="p-2.5 max-w-xs truncate text-slate-200">
                          {isNull ? (
                            <span className="text-slate-600 italic">null</span>
                          ) : isObj ? (
                            <span className="text-amber-300/90 bg-amber-950/40 px-1.5 py-0.5 rounded text-[11px]">
                              {displayVal}
                            </span>
                          ) : (
                            <span>{displayVal}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-2.5 text-center">
                      <button
                        onClick={() => setInspectRow(row)}
                        className="text-slate-400 hover:text-cyan-400 p-1 cursor-pointer transition-colors"
                        title="View Full JSON Record"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Row Inspector Modal */}
      {inspectRow && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-400" />
                Row JSON Inspection
              </h3>
              <button
                onClick={() => setInspectRow(null)}
                className="text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="bg-slate-950 font-mono text-xs text-cyan-300 p-4 rounded-lg overflow-x-auto max-h-96 border border-slate-800 leading-relaxed">
              {JSON.stringify(inspectRow, null, 2)}
            </pre>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectRow(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
