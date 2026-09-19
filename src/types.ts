export type HttpMethod = 'GET' | 'POST';

export interface ApiHeader {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiConfig {
  url: string;
  method: HttpMethod;
  headers: ApiHeader[];
  authType: 'none' | 'bearer' | 'basic' | 'apikey';
  bearerToken?: string;
  basicUser?: string;
  basicPass?: string;
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyIn?: 'header' | 'query';
  bodyPayload?: string;
  dataPath?: string; // Path to array in response, e.g. "data.users" or "items" or "" for root
  paginationType?: 'none' | 'page_param' | 'offset_limit';
  pageParamName?: string;
  pageSize?: number;
  maxPages?: number;
}

export interface PostgresConfig {
  connectionMode: 'connection_string' | 'parameters' | 'sandbox';
  connectionString?: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl: boolean | 'require' | 'prefer' | 'disable';
  tableName: string;
  createTableIfNotExists: boolean;
  conflictMode: 'insert_only' | 'upsert' | 'do_nothing' | 'truncate_first' | 'drop_recreate';
  primaryKeyColumn: string;
  batchSize: number;
}

export type PostgresColumnType = 
  | 'TEXT'
  | 'VARCHAR(255)'
  | 'INTEGER'
  | 'BIGINT'
  | 'NUMERIC(12,2)'
  | 'BOOLEAN'
  | 'TIMESTAMP WITH TIME ZONE'
  | 'JSONB'
  | 'UUID';

export interface FieldMapping {
  apiKey: string;
  columnName: string;
  columnType: PostgresColumnType;
  isPrimaryKey: boolean;
  isNullable: boolean;
  defaultValue?: string;
  transformFunction?: 'none' | 'json_stringify' | 'to_number' | 'to_boolean' | 'to_timestamp' | 'lowercase' | 'uppercase' | 'trim';
  selected: boolean;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  details?: any;
}

export interface SyncExecutionResult {
  jobId: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  totalFetched: number;
  totalInserted: number;
  totalUpdated: number;
  totalSkipped: number;
  totalFailed: number;
  durationMs: number;
  error?: string;
  logs: SyncLogEntry[];
  startTime?: string;
  endTime?: string;
}

export interface TableColumnSchema {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

export interface TableInfo {
  tableName: string;
  columns: TableColumnSchema[];
  rowCount?: number;
}

export interface ScheduledJob {
  id: string;
  name: string;
  intervalMinutes: number;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  lastStatus?: 'success' | 'failed';
  totalRuns: number;
}

export interface PresetApiTemplate {
  name: string;
  category: string;
  description: string;
  url: string;
  method: HttpMethod;
  dataPath: string;
  targetTable: string;
  primaryKey: string;
  headers?: ApiHeader[];
}
