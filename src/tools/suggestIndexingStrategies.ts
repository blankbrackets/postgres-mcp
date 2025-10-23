/**
 * Tool: suggest_indexing_strategies
 * Returns indexing analysis data for LLM to suggest optimization strategies
 */

import { executeQuery, validateIdentifier } from '../db.js';

export interface SuggestIndexingStrategiesInput {
  schema: string;
  table: string;
  workloadSample?: string[];
}

export interface IndexUsageStats {
  index_name: string;
  columns: string[];
  index_type: string;
  is_unique: boolean;
  is_primary: boolean;
  size: string;
  scans: number;
  tuples_read: number;
  tuples_fetched: number;
  size_bytes: number;
}

export interface UnusedIndex {
  index_name: string;
  columns: string[];
  size: string;
  reason: string;
}

export interface UnindexedForeignKey {
  constraint_name: string;
  column_name: string;
  foreign_table: string;
  foreign_column: string;
}

export interface DuplicateIndex {
  index1_name: string;
  index2_name: string;
  reason: string;
  suggestion: string;
}

export interface TableScanAnalysis {
  seq_scan: number;
  seq_tup_read: number;
  idx_scan: number;
  idx_tup_fetch: number;
  high_seq_scan_ratio: boolean;
  seq_scan_percentage: number;
}

export interface IndexingStrategiesOutput {
  schema: string;
  table: string;
  index_usage_stats: IndexUsageStats[];
  unused_indexes: UnusedIndex[];
  unindexed_fk_columns: UnindexedForeignKey[];
  duplicate_indexes: DuplicateIndex[];
  table_scan_analysis: TableScanAnalysis;
  recommendations_context: {
    total_indexes: number;
    total_index_size: string;
    table_size: string;
    row_count: number;
  };
}

/**
 * Analyzes indexing strategy and returns data for optimization suggestions
 */
export async function suggestIndexingStrategies(input: SuggestIndexingStrategiesInput): Promise<IndexingStrategiesOutput> {
  const { schema, table } = input;

  // Validate identifiers
  if (!validateIdentifier(schema) || !validateIdentifier(table)) {
    throw new Error('Invalid schema or table name');
  }

  // Get index usage statistics
  const indexStatsResult = await executeQuery<{
    indexname: string;
    indexdef: string;
    idx_scan: string;
    idx_tup_read: string;
    idx_tup_fetch: string;
    size_bytes: string;
    size_pretty: string;
  }>(`
    SELECT 
      i.indexname,
      i.indexdef,
      COALESCE(s.idx_scan, 0) as idx_scan,
      COALESCE(s.idx_tup_read, 0) as idx_tup_read,
      COALESCE(s.idx_tup_fetch, 0) as idx_tup_fetch,
      pg_relation_size(s.indexrelid) as size_bytes,
      pg_size_pretty(pg_relation_size(s.indexrelid)) as size_pretty
    FROM pg_indexes i
    LEFT JOIN pg_stat_user_indexes s 
      ON s.schemaname = i.schemaname 
      AND s.relname = i.tablename 
      AND s.indexrelname = i.indexname
    WHERE i.schemaname = $1 AND i.tablename = $2
    ORDER BY i.indexname
  `, [schema, table]);

  const index_usage_stats: IndexUsageStats[] = [];
  const unused_indexes: UnusedIndex[] = [];

  for (const row of indexStatsResult.rows) {
    const indexDef = row.indexdef;
    const isUnique = indexDef.includes('UNIQUE INDEX');
    const isPrimary = row.indexname.endsWith('_pkey');
    
    // Extract columns from index definition
    const columnsMatch = indexDef.match(/\(([^)]+)\)/);
    const columns = columnsMatch 
      ? columnsMatch[1].split(',').map(c => c.trim().replace(/^"(.*)"$/, '$1'))
      : [];

    // Determine index type
    let type = 'btree';
    if (indexDef.includes('USING gin')) type = 'gin';
    else if (indexDef.includes('USING gist')) type = 'gist';
    else if (indexDef.includes('USING hash')) type = 'hash';
    else if (indexDef.includes('USING brin')) type = 'brin';

    const scans = parseInt(row.idx_scan, 10);
    const size_bytes = parseInt(row.size_bytes, 10);

    const indexStat: IndexUsageStats = {
      index_name: row.indexname,
      columns,
      index_type: type,
      is_unique: isUnique,
      is_primary: isPrimary,
      size: row.size_pretty,
      scans,
      tuples_read: parseInt(row.idx_tup_read, 10),
      tuples_fetched: parseInt(row.idx_tup_fetch, 10),
      size_bytes,
    };

    index_usage_stats.push(indexStat);

    // Identify unused indexes (not primary key or unique constraint)
    if (scans === 0 && !isPrimary && !isUnique) {
      unused_indexes.push({
        index_name: row.indexname,
        columns,
        size: row.size_pretty,
        reason: 'Index has never been scanned',
      });
    }
  }

  // Check for unindexed foreign keys
  const unindexedFKResult = await executeQuery<{
    constraint_name: string;
    column_name: string;
    foreign_table_schema: string;
    foreign_table_name: string;
    foreign_column_name: string;
  }>(`
    SELECT 
      tc.constraint_name,
      kcu.column_name,
      ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.constraint_schema = kcu.constraint_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.constraint_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name
      AND rc.unique_constraint_schema = ccu.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = $1
      AND tc.table_name = $2
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index idx
        JOIN pg_class c ON c.oid = idx.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = idx.indkey[0]
        WHERE n.nspname = tc.table_schema
          AND c.relname = tc.table_name
          AND a.attname = kcu.column_name
      )
  `, [schema, table]);

  const unindexed_fk_columns: UnindexedForeignKey[] = unindexedFKResult.rows.map(row => ({
    constraint_name: row.constraint_name,
    column_name: row.column_name,
    foreign_table: `${row.foreign_table_schema}.${row.foreign_table_name}`,
    foreign_column: row.foreign_column_name,
  }));

  // Check for duplicate/redundant indexes
  const duplicate_indexes: DuplicateIndex[] = [];
  
  for (let i = 0; i < index_usage_stats.length; i++) {
    for (let j = i + 1; j < index_usage_stats.length; j++) {
      const idx1 = index_usage_stats[i];
      const idx2 = index_usage_stats[j];

      // Check if indexes have the same columns
      if (JSON.stringify(idx1.columns) === JSON.stringify(idx2.columns)) {
        duplicate_indexes.push({
          index1_name: idx1.index_name,
          index2_name: idx2.index_name,
          reason: 'Indexes have identical column sets',
          suggestion: `Consider dropping one of these indexes (prefer keeping ${idx1.scans > idx2.scans ? idx1.index_name : idx2.index_name} based on usage)`,
        });
      }
      // Check if one index is a prefix of another
      else if (idx1.columns.length < idx2.columns.length) {
        const isPrefix = idx1.columns.every((col, index) => idx2.columns[index] === col);
        if (isPrefix) {
          duplicate_indexes.push({
            index1_name: idx1.index_name,
            index2_name: idx2.index_name,
            reason: `${idx1.index_name} is a prefix of ${idx2.index_name}`,
            suggestion: `Consider dropping ${idx1.index_name} as ${idx2.index_name} can handle the same queries`,
          });
        }
      }
      else if (idx2.columns.length < idx1.columns.length) {
        const isPrefix = idx2.columns.every((col, index) => idx1.columns[index] === col);
        if (isPrefix) {
          duplicate_indexes.push({
            index1_name: idx2.index_name,
            index2_name: idx1.index_name,
            reason: `${idx2.index_name} is a prefix of ${idx1.index_name}`,
            suggestion: `Consider dropping ${idx2.index_name} as ${idx1.index_name} can handle the same queries`,
          });
        }
      }
    }
  }

  // Get table scan analysis
  const scanStatsResult = await executeQuery<{
    seq_scan: string;
    seq_tup_read: string;
    idx_scan: string;
    idx_tup_fetch: string;
  }>(`
    SELECT 
      COALESCE(seq_scan, 0) as seq_scan,
      COALESCE(seq_tup_read, 0) as seq_tup_read,
      COALESCE(idx_scan, 0) as idx_scan,
      COALESCE(idx_tup_fetch, 0) as idx_tup_fetch
    FROM pg_stat_user_tables
    WHERE schemaname = $1 AND relname = $2
  `, [schema, table]);

  const scanStats = scanStatsResult.rows[0] || {
    seq_scan: '0',
    seq_tup_read: '0',
    idx_scan: '0',
    idx_tup_fetch: '0',
  };

  const seq_scan = parseInt(scanStats.seq_scan, 10);
  const idx_scan = parseInt(scanStats.idx_scan, 10);
  const total_scans = seq_scan + idx_scan;
  const seq_scan_percentage = total_scans > 0 ? (seq_scan / total_scans) * 100 : 0;
  const high_seq_scan_ratio = seq_scan_percentage > 50 && total_scans > 100;

  const table_scan_analysis: TableScanAnalysis = {
    seq_scan,
    seq_tup_read: parseInt(scanStats.seq_tup_read, 10),
    idx_scan,
    idx_tup_fetch: parseInt(scanStats.idx_tup_fetch, 10),
    high_seq_scan_ratio,
    seq_scan_percentage: Math.round(seq_scan_percentage * 100) / 100,
  };

  // Get recommendations context
  const totalIndexSize = index_usage_stats.reduce((sum, idx) => sum + idx.size_bytes, 0);
  
  const contextResult = await executeQuery<{
    table_size: string;
    row_count: string;
  }>(`
    SELECT 
      pg_size_pretty(pg_total_relation_size(c.oid)) as table_size,
      COALESCE(s.n_live_tup, 0) as row_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.schemaname = n.nspname AND s.relname = c.relname
    WHERE n.nspname = $1 AND c.relname = $2
  `, [schema, table]);

  const context = contextResult.rows[0] || { table_size: '0 bytes', row_count: '0' };

  return {
    schema,
    table,
    index_usage_stats,
    unused_indexes,
    unindexed_fk_columns,
    duplicate_indexes,
    table_scan_analysis,
    recommendations_context: {
      total_indexes: index_usage_stats.length,
      total_index_size: totalIndexSize > 0 ? `${(totalIndexSize / 1024 / 1024).toFixed(2)} MB` : '0 bytes',
      table_size: context.table_size,
      row_count: parseInt(context.row_count, 10),
    },
  };
}

