/**
 * Tool: get_database_health
 * Returns overall database health metrics and identifies performance issues
 */

import { executeQuery } from '../db.js';

export interface DatabaseHealthOutput {
  database_size: {
    total_size: string;
    total_size_bytes: number;
  };
  cache_performance: {
    cache_hit_ratio: number;
    buffer_cache_hit_ratio: number;
    index_cache_hit_ratio: number;
  };
  table_statistics: {
    total_tables: number;
    tables_never_vacuumed: number;
    tables_never_analyzed: number;
    tables_with_high_bloat: number;
  };
  index_statistics: {
    total_indexes: number;
    unused_indexes: number;
    total_index_size: string;
  };
  connection_info: {
    max_connections: number;
    current_connections: number;
    connection_utilization_percent: number;
    idle_connections: number;
    active_connections: number;
  };
  replication_health?: {
    is_primary: boolean;
    replication_slots: number;
    active_replicas: number;
    max_lag_bytes?: number;
    max_lag_seconds?: number;
  };
  constraint_health: {
    total_constraints: number;
    invalid_constraints: number;
    invalid_constraint_details: Array<{
      schema: string;
      table: string;
      constraint_name: string;
      constraint_type: string;
    }>;
  };
  sequence_health: {
    total_sequences: number;
    sequences_at_risk: number;
    at_risk_details: Array<{
      schema: string;
      sequence: string;
      current_value: number;
      max_value: number;
      percent_used: number;
    }>;
  };
  performance_issues: string[];
  recommendations: string[];
}

/**
 * Gets comprehensive database health metrics
 */
export async function getDatabaseHealth(): Promise<DatabaseHealthOutput> {
  const performance_issues: string[] = [];
  const recommendations: string[] = [];

  // Database size
  const sizeResult = await executeQuery<{
    total_size: string;
    total_size_bytes: string;
  }>(`
    SELECT 
      pg_size_pretty(pg_database_size(current_database())) as total_size,
      pg_database_size(current_database()) as total_size_bytes
  `);

  const database_size = {
    total_size: sizeResult.rows[0].total_size,
    total_size_bytes: parseInt(sizeResult.rows[0].total_size_bytes, 10),
  };

  // Cache performance
  const cacheResult = await executeQuery<{
    heap_blks_read: string;
    heap_blks_hit: string;
    idx_blks_read: string;
    idx_blks_hit: string;
  }>(`
    SELECT 
      SUM(heap_blks_read) as heap_blks_read,
      SUM(heap_blks_hit) as heap_blks_hit,
      SUM(idx_blks_read) as idx_blks_read,
      SUM(idx_blks_hit) as idx_blks_hit
    FROM pg_statio_user_tables
  `);

  const heap_read = parseFloat(cacheResult.rows[0].heap_blks_read || '0');
  const heap_hit = parseFloat(cacheResult.rows[0].heap_blks_hit || '0');
  const idx_read = parseFloat(cacheResult.rows[0].idx_blks_read || '0');
  const idx_hit = parseFloat(cacheResult.rows[0].idx_blks_hit || '0');

  const total_heap = heap_read + heap_hit;
  const total_idx = idx_read + idx_hit;
  const total_all = total_heap + total_idx;

  const cache_hit_ratio = total_all > 0 ? ((heap_hit + idx_hit) / total_all) * 100 : 100;
  const buffer_cache_hit_ratio = total_heap > 0 ? (heap_hit / total_heap) * 100 : 100;
  const index_cache_hit_ratio = total_idx > 0 ? (idx_hit / total_idx) * 100 : 100;

  const cache_performance = {
    cache_hit_ratio: Math.round(cache_hit_ratio * 100) / 100,
    buffer_cache_hit_ratio: Math.round(buffer_cache_hit_ratio * 100) / 100,
    index_cache_hit_ratio: Math.round(index_cache_hit_ratio * 100) / 100,
  };

  if (cache_hit_ratio < 90) {
    performance_issues.push(`Low overall cache hit ratio: ${cache_hit_ratio.toFixed(1)}%`);
    recommendations.push('Consider increasing shared_buffers and effective_cache_size');
  }

  // Table statistics
  const tableStatsResult = await executeQuery<{
    total_tables: string;
    never_vacuumed: string;
    never_analyzed: string;
    high_bloat: string;
  }>(`
    SELECT 
      COUNT(*) as total_tables,
      COUNT(*) FILTER (WHERE last_vacuum IS NULL AND last_autovacuum IS NULL) as never_vacuumed,
      COUNT(*) FILTER (WHERE last_analyze IS NULL AND last_autoanalyze IS NULL) as never_analyzed,
      COUNT(*) FILTER (WHERE n_dead_tup::float / NULLIF(n_live_tup + n_dead_tup, 0) > 0.2) as high_bloat
    FROM pg_stat_user_tables
  `);

  const table_statistics = {
    total_tables: parseInt(tableStatsResult.rows[0].total_tables, 10),
    tables_never_vacuumed: parseInt(tableStatsResult.rows[0].never_vacuumed, 10),
    tables_never_analyzed: parseInt(tableStatsResult.rows[0].never_analyzed, 10),
    tables_with_high_bloat: parseInt(tableStatsResult.rows[0].high_bloat, 10),
  };

  if (table_statistics.tables_never_vacuumed > 0) {
    performance_issues.push(`${table_statistics.tables_never_vacuumed} tables have never been vacuumed`);
    recommendations.push('Enable autovacuum or manually vacuum tables');
  }

  if (table_statistics.tables_never_analyzed > 0) {
    performance_issues.push(`${table_statistics.tables_never_analyzed} tables have never been analyzed`);
    recommendations.push('Run ANALYZE on tables to update statistics for the query planner');
  }

  if (table_statistics.tables_with_high_bloat > 0) {
    performance_issues.push(`${table_statistics.tables_with_high_bloat} tables have high bloat (>20% dead tuples)`);
    recommendations.push('Consider running VACUUM FULL on bloated tables during maintenance window');
  }

  // Index statistics
  const indexStatsResult = await executeQuery<{
    total_indexes: string;
    unused_indexes: string;
    total_size: string;
  }>(`
    SELECT 
      COUNT(*) as total_indexes,
      COUNT(*) FILTER (WHERE idx_scan = 0) as unused_indexes,
      pg_size_pretty(SUM(pg_relation_size(indexrelid))) as total_size
    FROM pg_stat_user_indexes
  `);

  const index_statistics = {
    total_indexes: parseInt(indexStatsResult.rows[0].total_indexes, 10),
    unused_indexes: parseInt(indexStatsResult.rows[0].unused_indexes, 10),
    total_index_size: indexStatsResult.rows[0].total_size,
  };

  if (index_statistics.unused_indexes > 0) {
    performance_issues.push(`${index_statistics.unused_indexes} indexes are never used`);
    recommendations.push('Drop unused indexes to save disk space and improve write performance');
  }

  // Connection info (enhanced with idle/active breakdown)
  const connResult = await executeQuery<{
    max_connections: string;
  }>(`
    SELECT setting::int as max_connections
    FROM pg_settings
    WHERE name = 'max_connections'
  `);

  const currentConnResult = await executeQuery<{
    total: string;
    idle: string;
    active: string;
  }>(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE state = 'idle') as idle,
      COUNT(*) FILTER (WHERE state = 'active') as active
    FROM pg_stat_activity
  `);

  const max_connections = parseInt(connResult.rows[0].max_connections, 10);
  const current_connections = parseInt(currentConnResult.rows[0].total, 10);
  const idle_connections = parseInt(currentConnResult.rows[0].idle, 10);
  const active_connections = parseInt(currentConnResult.rows[0].active, 10);
  const connection_utilization_percent = (current_connections / max_connections) * 100;

  const connection_info = {
    max_connections,
    current_connections,
    connection_utilization_percent: Math.round(connection_utilization_percent * 100) / 100,
    idle_connections,
    active_connections,
  };

  if (connection_utilization_percent > 80) {
    performance_issues.push(`High connection utilization: ${connection_utilization_percent.toFixed(1)}%`);
    recommendations.push('Consider increasing max_connections or implementing connection pooling');
  }

  if (idle_connections > current_connections * 0.5 && current_connections > 20) {
    performance_issues.push(`High number of idle connections: ${idle_connections} (${((idle_connections / current_connections) * 100).toFixed(1)}%)`);
    recommendations.push('Consider connection pooling with shorter idle timeouts');
  }

  // Additional checks
  const seqScanResult = await executeQuery<{
    tables_with_high_seq_scans: string;
  }>(`
    SELECT COUNT(*) as tables_with_high_seq_scans
    FROM pg_stat_user_tables
    WHERE seq_scan > 1000
      AND idx_scan < seq_scan
      AND n_live_tup > 10000
  `);

  const highSeqScans = parseInt(seqScanResult.rows[0].tables_with_high_seq_scans, 10);
  if (highSeqScans > 0) {
    performance_issues.push(`${highSeqScans} large tables have more sequential scans than index scans`);
    recommendations.push('Analyze these tables with suggest_indexing_strategies tool');
  }

  // Replication health check
  let replication_health: DatabaseHealthOutput['replication_health'];
  try {
    const replicationResult = await executeQuery<{
      is_in_recovery: boolean;
      replication_slots: string;
      active_replicas: string;
    }>(`
      SELECT 
        pg_is_in_recovery() as is_in_recovery,
        (SELECT COUNT(*) FROM pg_replication_slots) as replication_slots,
        (SELECT COUNT(*) FROM pg_stat_replication) as active_replicas
    `);

    const is_primary = !replicationResult.rows[0].is_in_recovery;
    const replication_slots = parseInt(replicationResult.rows[0].replication_slots, 10);
    const active_replicas = parseInt(replicationResult.rows[0].active_replicas, 10);

    // Check replication lag if we're the primary
    if (is_primary && active_replicas > 0) {
      const lagResult = await executeQuery<{
        max_lag_bytes: string;
        max_lag_seconds: string;
      }>(`
        SELECT 
          MAX(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) as max_lag_bytes,
          MAX(EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))) as max_lag_seconds
        FROM pg_stat_replication
      `);

      const max_lag_bytes = parseInt(lagResult.rows[0].max_lag_bytes || '0', 10);
      const max_lag_seconds = parseFloat(lagResult.rows[0].max_lag_seconds || '0');

      replication_health = {
        is_primary,
        replication_slots,
        active_replicas,
        max_lag_bytes,
        max_lag_seconds,
      };

      if (max_lag_bytes > 100 * 1024 * 1024) { // 100MB
        performance_issues.push(`High replication lag: ${(max_lag_bytes / 1024 / 1024).toFixed(2)} MB`);
        recommendations.push('Investigate replication lag - check network, replica resources, or increase wal_sender_timeout');
      }

      if (replication_slots > active_replicas) {
        performance_issues.push(`Inactive replication slots detected: ${replication_slots - active_replicas}`);
        recommendations.push('Drop inactive replication slots to prevent WAL accumulation');
      }
    } else {
      replication_health = {
        is_primary,
        replication_slots,
        active_replicas,
      };
    }
  } catch (error) {
    // Replication queries might fail if user lacks permissions or on single-node setups
    // This is not critical, so we just skip it
  }

  // Constraint health check
  const constraintResult = await executeQuery<{
    total_constraints: string;
    invalid_constraints: string;
  }>(`
    SELECT 
      COUNT(*) as total_constraints,
      COUNT(*) FILTER (WHERE NOT convalidated) as invalid_constraints
    FROM pg_constraint
    WHERE contype IN ('f', 'c', 'u', 'p')
  `);

  const total_constraints = parseInt(constraintResult.rows[0].total_constraints, 10);
  const invalid_constraints = parseInt(constraintResult.rows[0].invalid_constraints, 10);

  const invalid_constraint_details: DatabaseHealthOutput['constraint_health']['invalid_constraint_details'] = [];

  if (invalid_constraints > 0) {
    const invalidDetailsResult = await executeQuery<{
      schema_name: string;
      table_name: string;
      constraint_name: string;
      constraint_type: string;
    }>(`
      SELECT 
        n.nspname as schema_name,
        c.relname as table_name,
        con.conname as constraint_name,
        CASE con.contype
          WHEN 'f' THEN 'FOREIGN KEY'
          WHEN 'c' THEN 'CHECK'
          WHEN 'u' THEN 'UNIQUE'
          WHEN 'p' THEN 'PRIMARY KEY'
        END as constraint_type
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT con.convalidated
      ORDER BY n.nspname, c.relname, con.conname
    `);

    invalid_constraint_details.push(...invalidDetailsResult.rows.map(row => ({
      schema: row.schema_name,
      table: row.table_name,
      constraint_name: row.constraint_name,
      constraint_type: row.constraint_type,
    })));

    performance_issues.push(`${invalid_constraints} invalid constraints found`);
    recommendations.push('Validate invalid constraints or drop them if they are no longer needed');
  }

  const constraint_health = {
    total_constraints,
    invalid_constraints,
    invalid_constraint_details,
  };

  // Sequence health check (find sequences near their max value)
  const sequenceResult = await executeQuery<{
    schema_name: string;
    sequence_name: string;
    last_value: string;
    max_value: string;
  }>(`
    SELECT 
      schemaname as schema_name,
      sequencename as sequence_name,
      last_value,
      max_value
    FROM pg_sequences
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  `);

  const at_risk_details: DatabaseHealthOutput['sequence_health']['at_risk_details'] = [];
  let sequences_at_risk = 0;

  for (const row of sequenceResult.rows) {
    const current_value = parseInt(row.last_value, 10);
    const max_value = parseInt(row.max_value, 10);
    const percent_used = (current_value / max_value) * 100;

    // Flag sequences that are over 75% used
    if (percent_used > 75) {
      sequences_at_risk++;
      at_risk_details.push({
        schema: row.schema_name,
        sequence: row.sequence_name,
        current_value,
        max_value,
        percent_used: Math.round(percent_used * 100) / 100,
      });
    }
  }

  if (sequences_at_risk > 0) {
    performance_issues.push(`${sequences_at_risk} sequences are at risk of reaching their maximum value`);
    recommendations.push('Consider using BIGINT for sequence columns or resetting sequences');
  }

  const sequence_health = {
    total_sequences: sequenceResult.rows.length,
    sequences_at_risk,
    at_risk_details,
  };

  if (performance_issues.length === 0) {
    recommendations.push('Database health looks good! Continue monitoring regularly.');
  }

  return {
    database_size,
    cache_performance,
    table_statistics,
    index_statistics,
    connection_info,
    replication_health,
    constraint_health,
    sequence_health,
    performance_issues,
    recommendations,
  };
}

