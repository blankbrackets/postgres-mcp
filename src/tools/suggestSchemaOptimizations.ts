/**
 * Tool: suggest_schema_optimizations
 * Returns analysis data about table schema for LLM to suggest optimizations
 */

import { executeQuery, validateIdentifier } from '../db.js';

export interface SuggestSchemaOptimizationsInput {
  schema: string;
  table: string;
}

export interface ColumnAnalysis {
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  nullability_rate: number;
  cardinality: number;
  avg_width: number;
  is_indexed: boolean;
  is_foreign_key: boolean;
  distinct_sample_size: number;
}

export interface ForeignKeyAnalysis {
  constraint_name: string;
  column_name: string;
  foreign_table: string;
  foreign_column: string;
  has_index: boolean;
}

export interface BloatAnalysis {
  n_live_tup: number;
  n_dead_tup: number;
  bloat_percentage: number;
  last_vacuum: string | null;
  last_autovacuum: string | null;
  last_analyze: string | null;
}

export interface DataTypeIssue {
  column_name: string;
  current_type: string;
  issue: string;
  suggestion: string;
}

export interface SchemaOptimizationsOutput {
  schema: string;
  table: string;
  column_analysis: ColumnAnalysis[];
  foreign_keys: ForeignKeyAnalysis[];
  bloat_analysis: BloatAnalysis;
  data_type_issues: DataTypeIssue[];
  total_size: string;
  row_count: number;
}

/**
 * Analyzes table schema and returns data for optimization suggestions
 */
export async function suggestSchemaOptimizations(input: SuggestSchemaOptimizationsInput): Promise<SchemaOptimizationsOutput> {
  const { schema, table } = input;

  // Validate identifiers
  if (!validateIdentifier(schema) || !validateIdentifier(table)) {
    throw new Error('Invalid schema or table name');
  }

  // Get column information with statistics
  const columnsResult = await executeQuery<{
    column_name: string;
    data_type: string;
    character_maximum_length: number | null;
  }>(`
    SELECT 
      column_name,
      data_type,
      character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, [schema, table]);

  if (columnsResult.rows.length === 0) {
    throw new Error(`Table ${schema}.${table} not found`);
  }

  // Get indexed columns
  const indexedColumnsResult = await executeQuery<{ column_name: string }>(`
    SELECT DISTINCT
      a.attname as column_name
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE n.nspname = $1 AND c.relname = $2
  `, [schema, table]);

  const indexedColumns = new Set(indexedColumnsResult.rows.map(r => r.column_name));

  // Get foreign key columns
  const fkColumnsResult = await executeQuery<{ column_name: string }>(`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.constraint_schema = kcu.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = $1
      AND tc.table_name = $2
  `, [schema, table]);

  const fkColumns = new Set(fkColumnsResult.rows.map(r => r.column_name));

  // Analyze each column
  const column_analysis: ColumnAnalysis[] = [];
  
  for (const col of columnsResult.rows) {
    try {
      // Build safe query using parameterized column reference
      // Note: Column names in queries need to be carefully handled
      const statsQuery = `
        SELECT 
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE "${col.column_name}" IS NULL) as null_count,
          COUNT(DISTINCT "${col.column_name}") as distinct_count,
          AVG(LENGTH("${col.column_name}"::text)) as avg_width
        FROM "${schema}"."${table}"
        LIMIT 10000
      `;
      
      const statsResult = await executeQuery<{
        total_count: string;
        null_count: string;
        distinct_count: string;
        avg_width: string | null;
      }>(statsQuery);

      if (statsResult.rows.length > 0) {
        const stats = statsResult.rows[0];
        const total = parseInt(stats.total_count, 10);
        const nulls = parseInt(stats.null_count, 10);
        const distinct = parseInt(stats.distinct_count, 10);
        const avg_width = stats.avg_width ? parseFloat(stats.avg_width) : 0;

        column_analysis.push({
          column_name: col.column_name,
          data_type: col.data_type,
          character_maximum_length: col.character_maximum_length,
          nullability_rate: total > 0 ? (nulls / total) * 100 : 0,
          cardinality: distinct,
          avg_width: Math.round(avg_width),
          is_indexed: indexedColumns.has(col.column_name),
          is_foreign_key: fkColumns.has(col.column_name),
          distinct_sample_size: total,
        });
      }
    } catch (error) {
      // If analysis fails for a column, add it with default values
      column_analysis.push({
        column_name: col.column_name,
        data_type: col.data_type,
        character_maximum_length: col.character_maximum_length,
        nullability_rate: 0,
        cardinality: 0,
        avg_width: 0,
        is_indexed: indexedColumns.has(col.column_name),
        is_foreign_key: fkColumns.has(col.column_name),
        distinct_sample_size: 0,
      });
    }
  }

  // Get foreign key analysis
  const fkResult = await executeQuery<{
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
  `, [schema, table]);

  const foreign_keys: ForeignKeyAnalysis[] = fkResult.rows.map(row => ({
    constraint_name: row.constraint_name,
    column_name: row.column_name,
    foreign_table: `${row.foreign_table_schema}.${row.foreign_table_name}`,
    foreign_column: row.foreign_column_name,
    has_index: indexedColumns.has(row.column_name),
  }));

  // Get bloat analysis
  const bloatResult = await executeQuery<{
    n_live_tup: string;
    n_dead_tup: string;
    last_vacuum: string | null;
    last_autovacuum: string | null;
    last_analyze: string | null;
  }>(`
    SELECT 
      COALESCE(n_live_tup, 0) as n_live_tup,
      COALESCE(n_dead_tup, 0) as n_dead_tup,
      last_vacuum,
      last_autovacuum,
      last_analyze
    FROM pg_stat_user_tables
    WHERE schemaname = $1 AND relname = $2
  `, [schema, table]);

  const bloat = bloatResult.rows[0] || {
    n_live_tup: '0',
    n_dead_tup: '0',
    last_vacuum: null,
    last_autovacuum: null,
    last_analyze: null,
  };

  const n_live = parseInt(bloat.n_live_tup, 10);
  const n_dead = parseInt(bloat.n_dead_tup, 10);
  const total_tup = n_live + n_dead;
  const bloat_percentage = total_tup > 0 ? (n_dead / total_tup) * 100 : 0;

  const bloat_analysis: BloatAnalysis = {
    n_live_tup: n_live,
    n_dead_tup: n_dead,
    bloat_percentage: Math.round(bloat_percentage * 100) / 100,
    last_vacuum: bloat.last_vacuum,
    last_autovacuum: bloat.last_autovacuum,
    last_analyze: bloat.last_analyze,
  };

  // Identify potential data type issues
  const data_type_issues: DataTypeIssue[] = [];

  for (const col of column_analysis) {
    // TEXT columns with low cardinality might benefit from ENUM or smaller types
    if (col.data_type === 'text' && col.cardinality > 0 && col.cardinality < 50 && col.distinct_sample_size > 100) {
      data_type_issues.push({
        column_name: col.column_name,
        current_type: col.data_type,
        issue: `Low cardinality (${col.cardinality} distinct values)`,
        suggestion: 'Consider using ENUM type or smaller VARCHAR',
      });
    }

    // VARCHAR with excessive length
    if (col.data_type === 'character varying' && col.character_maximum_length && col.avg_width > 0) {
      if (col.character_maximum_length > col.avg_width * 3) {
        data_type_issues.push({
          column_name: col.column_name,
          current_type: `varchar(${col.character_maximum_length})`,
          issue: `Max length ${col.character_maximum_length} much larger than avg width ${col.avg_width}`,
          suggestion: `Consider reducing to varchar(${Math.ceil(col.avg_width * 1.5)})`,
        });
      }
    }

    // High nullability (>50%) might indicate optional relationship or design issue
    if (col.nullability_rate > 50 && col.distinct_sample_size > 100) {
      data_type_issues.push({
        column_name: col.column_name,
        current_type: col.data_type,
        issue: `High null rate: ${col.nullability_rate.toFixed(1)}%`,
        suggestion: 'Consider if this should be a separate optional table or has default value',
      });
    }
  }

  // Get total size and row count
  const sizeResult = await executeQuery<{
    total_size: string;
    row_count: string;
  }>(`
    SELECT 
      pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
      COALESCE(s.n_live_tup, 0) as row_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.schemaname = n.nspname AND s.relname = c.relname
    WHERE n.nspname = $1 AND c.relname = $2
  `, [schema, table]);

  const size = sizeResult.rows[0] || { total_size: '0 bytes', row_count: '0' };

  return {
    schema,
    table,
    column_analysis,
    foreign_keys,
    bloat_analysis,
    data_type_issues,
    total_size: size.total_size,
    row_count: parseInt(size.row_count, 10),
  };
}

