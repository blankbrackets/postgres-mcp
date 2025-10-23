/**
 * Tool: get_query_statistics
 * Returns query and I/O statistics for a specific table
 */

import { executeQuery, validateIdentifier } from '../db.js';

export interface GetQueryStatisticsInput {
  schema: string;
  table: string;
  limit?: number;
}

export interface TableStatistics {
  seq_scan: number;
  seq_tup_read: number;
  idx_scan: number;
  idx_tup_fetch: number;
  n_tup_ins: number;
  n_tup_upd: number;
  n_tup_del: number;
  n_tup_hot_upd: number;
  n_live_tup: number;
  n_dead_tup: number;
  last_vacuum: string | null;
  last_autovacuum: string | null;
  last_analyze: string | null;
  last_autoanalyze: string | null;
  vacuum_count: number;
  autovacuum_count: number;
  analyze_count: number;
  autoanalyze_count: number;
}

export interface IOStatistics {
  heap_blks_read: number;
  heap_blks_hit: number;
  idx_blks_read: number;
  idx_blks_hit: number;
  toast_blks_read: number;
  toast_blks_hit: number;
  tidx_blks_read: number;
  tidx_blks_hit: number;
  cache_hit_ratio: number;
}

export interface IndexStatistics {
  index_name: string;
  idx_scan: number;
  idx_tup_read: number;
  idx_tup_fetch: number;
  idx_blks_read: number;
  idx_blks_hit: number;
  size: string;
}

export interface QueryStatisticsOutput {
  schema: string;
  table: string;
  table_statistics: TableStatistics;
  io_statistics: IOStatistics;
  index_statistics: IndexStatistics[];
  bloat_estimate: {
    dead_tuple_percent: number;
    estimated_bloat: string;
  };
}

/**
 * Gets query and I/O statistics for a table
 */
export async function getQueryStatistics(input: GetQueryStatisticsInput): Promise<QueryStatisticsOutput> {
  const { schema, table } = input;

  // Validate identifiers
  if (!validateIdentifier(schema) || !validateIdentifier(table)) {
    throw new Error('Invalid schema or table name');
  }

  // Get table statistics from pg_stat_user_tables
  const tableStatsResult = await executeQuery<{
    seq_scan: string;
    seq_tup_read: string;
    idx_scan: string;
    idx_tup_fetch: string;
    n_tup_ins: string;
    n_tup_upd: string;
    n_tup_del: string;
    n_tup_hot_upd: string;
    n_live_tup: string;
    n_dead_tup: string;
    last_vacuum: string | null;
    last_autovacuum: string | null;
    last_analyze: string | null;
    last_autoanalyze: string | null;
    vacuum_count: string;
    autovacuum_count: string;
    analyze_count: string;
    autoanalyze_count: string;
  }>(`
    SELECT 
      COALESCE(seq_scan, 0) as seq_scan,
      COALESCE(seq_tup_read, 0) as seq_tup_read,
      COALESCE(idx_scan, 0) as idx_scan,
      COALESCE(idx_tup_fetch, 0) as idx_tup_fetch,
      COALESCE(n_tup_ins, 0) as n_tup_ins,
      COALESCE(n_tup_upd, 0) as n_tup_upd,
      COALESCE(n_tup_del, 0) as n_tup_del,
      COALESCE(n_tup_hot_upd, 0) as n_tup_hot_upd,
      COALESCE(n_live_tup, 0) as n_live_tup,
      COALESCE(n_dead_tup, 0) as n_dead_tup,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze,
      COALESCE(vacuum_count, 0) as vacuum_count,
      COALESCE(autovacuum_count, 0) as autovacuum_count,
      COALESCE(analyze_count, 0) as analyze_count,
      COALESCE(autoanalyze_count, 0) as autoanalyze_count
    FROM pg_stat_user_tables
    WHERE schemaname = $1 AND relname = $2
  `, [schema, table]);

  if (tableStatsResult.rows.length === 0) {
    throw new Error(`Table ${schema}.${table} not found in statistics`);
  }

  const tableStats = tableStatsResult.rows[0];

  const table_statistics: TableStatistics = {
    seq_scan: parseInt(tableStats.seq_scan, 10),
    seq_tup_read: parseInt(tableStats.seq_tup_read, 10),
    idx_scan: parseInt(tableStats.idx_scan, 10),
    idx_tup_fetch: parseInt(tableStats.idx_tup_fetch, 10),
    n_tup_ins: parseInt(tableStats.n_tup_ins, 10),
    n_tup_upd: parseInt(tableStats.n_tup_upd, 10),
    n_tup_del: parseInt(tableStats.n_tup_del, 10),
    n_tup_hot_upd: parseInt(tableStats.n_tup_hot_upd, 10),
    n_live_tup: parseInt(tableStats.n_live_tup, 10),
    n_dead_tup: parseInt(tableStats.n_dead_tup, 10),
    last_vacuum: tableStats.last_vacuum,
    last_autovacuum: tableStats.last_autovacuum,
    last_analyze: tableStats.last_analyze,
    last_autoanalyze: tableStats.last_autoanalyze,
    vacuum_count: parseInt(tableStats.vacuum_count, 10),
    autovacuum_count: parseInt(tableStats.autovacuum_count, 10),
    analyze_count: parseInt(tableStats.analyze_count, 10),
    autoanalyze_count: parseInt(tableStats.autoanalyze_count, 10),
  };

  // Get I/O statistics from pg_statio_user_tables
  const ioStatsResult = await executeQuery<{
    heap_blks_read: string;
    heap_blks_hit: string;
    idx_blks_read: string;
    idx_blks_hit: string;
    toast_blks_read: string;
    toast_blks_hit: string;
    tidx_blks_read: string;
    tidx_blks_hit: string;
  }>(`
    SELECT 
      COALESCE(heap_blks_read, 0) as heap_blks_read,
      COALESCE(heap_blks_hit, 0) as heap_blks_hit,
      COALESCE(idx_blks_read, 0) as idx_blks_read,
      COALESCE(idx_blks_hit, 0) as idx_blks_hit,
      COALESCE(toast_blks_read, 0) as toast_blks_read,
      COALESCE(toast_blks_hit, 0) as toast_blks_hit,
      COALESCE(tidx_blks_read, 0) as tidx_blks_read,
      COALESCE(tidx_blks_hit, 0) as tidx_blks_hit
    FROM pg_statio_user_tables
    WHERE schemaname = $1 AND relname = $2
  `, [schema, table]);

  const ioStats = ioStatsResult.rows[0] || {
    heap_blks_read: '0',
    heap_blks_hit: '0',
    idx_blks_read: '0',
    idx_blks_hit: '0',
    toast_blks_read: '0',
    toast_blks_hit: '0',
    tidx_blks_read: '0',
    tidx_blks_hit: '0',
  };

  const heap_blks_read = parseInt(ioStats.heap_blks_read, 10);
  const heap_blks_hit = parseInt(ioStats.heap_blks_hit, 10);
  const total_heap_blks = heap_blks_read + heap_blks_hit;
  const cache_hit_ratio = total_heap_blks > 0 
    ? (heap_blks_hit / total_heap_blks) * 100 
    : 0;

  const io_statistics: IOStatistics = {
    heap_blks_read,
    heap_blks_hit,
    idx_blks_read: parseInt(ioStats.idx_blks_read, 10),
    idx_blks_hit: parseInt(ioStats.idx_blks_hit, 10),
    toast_blks_read: parseInt(ioStats.toast_blks_read, 10),
    toast_blks_hit: parseInt(ioStats.toast_blks_hit, 10),
    tidx_blks_read: parseInt(ioStats.tidx_blks_read, 10),
    tidx_blks_hit: parseInt(ioStats.tidx_blks_hit, 10),
    cache_hit_ratio: Math.round(cache_hit_ratio * 100) / 100,
  };

  // Get index statistics
  const indexStatsResult = await executeQuery<{
    indexrelname: string;
    idx_scan: string;
    idx_tup_read: string;
    idx_tup_fetch: string;
    idx_blks_read: string;
    idx_blks_hit: string;
    size: string;
  }>(`
    SELECT 
      s.indexrelname,
      COALESCE(s.idx_scan, 0) as idx_scan,
      COALESCE(s.idx_tup_read, 0) as idx_tup_read,
      COALESCE(s.idx_tup_fetch, 0) as idx_tup_fetch,
      COALESCE(io.idx_blks_read, 0) as idx_blks_read,
      COALESCE(io.idx_blks_hit, 0) as idx_blks_hit,
      pg_size_pretty(pg_relation_size(s.indexrelid)) as size
    FROM pg_stat_user_indexes s
    LEFT JOIN pg_statio_user_indexes io
      ON s.indexrelid = io.indexrelid
    WHERE s.schemaname = $1 AND s.relname = $2
    ORDER BY s.idx_scan DESC
  `, [schema, table]);

  const index_statistics: IndexStatistics[] = indexStatsResult.rows.map(row => ({
    index_name: row.indexrelname,
    idx_scan: parseInt(row.idx_scan, 10),
    idx_tup_read: parseInt(row.idx_tup_read, 10),
    idx_tup_fetch: parseInt(row.idx_tup_fetch, 10),
    idx_blks_read: parseInt(row.idx_blks_read, 10),
    idx_blks_hit: parseInt(row.idx_blks_hit, 10),
    size: row.size,
  }));

  // Calculate bloat estimate
  const n_live = table_statistics.n_live_tup;
  const n_dead = table_statistics.n_dead_tup;
  const total_tup = n_live + n_dead;
  const dead_tuple_percent = total_tup > 0 ? (n_dead / total_tup) * 100 : 0;
  
  let bloat_description = 'Low';
  if (dead_tuple_percent > 20) bloat_description = 'High';
  else if (dead_tuple_percent > 10) bloat_description = 'Moderate';

  return {
    schema,
    table,
    table_statistics,
    io_statistics,
    index_statistics,
    bloat_estimate: {
      dead_tuple_percent: Math.round(dead_tuple_percent * 100) / 100,
      estimated_bloat: bloat_description,
    },
  };
}

