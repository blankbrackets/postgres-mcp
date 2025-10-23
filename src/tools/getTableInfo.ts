/**
 * Tool: get_table_info
 * Returns detailed information about a specific table including columns, size, indexes, and constraints
 */

import { executeQuery, validateIdentifier } from '../db.js';

export interface GetTableInfoInput {
  schema: string;
  table: string;
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  characterMaximumLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
}

export interface TableIndex {
  name: string;
  columns: string[];
  unique: boolean;
  size: string;
  scans: number;
  tuples_read: number;
  tuples_fetched: number;
}

export interface TableConstraint {
  name: string;
  type: string;
  definition: string;
}

export interface TableInfoOutput {
  schema: string;
  table: string;
  columns: TableColumn[];
  row_count: number;
  size_bytes: number;
  size_pretty: string;
  indexes: TableIndex[];
  constraints: TableConstraint[];
  table_type: string;
}

/**
 * Gets comprehensive information about a table
 */
export async function getTableInfo(input: GetTableInfoInput): Promise<TableInfoOutput> {
  const { schema, table } = input;

  // Validate identifiers
  if (!validateIdentifier(schema) || !validateIdentifier(table)) {
    throw new Error('Invalid schema or table name');
  }

  // Get column information
  const columnsResult = await executeQuery<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
  }>(`
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default,
      character_maximum_length,
      numeric_precision,
      numeric_scale
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, [schema, table]);

  const columns: TableColumn[] = columnsResult.rows.map(row => ({
    name: row.column_name,
    type: row.data_type,
    nullable: row.is_nullable === 'YES',
    default: row.column_default,
    characterMaximumLength: row.character_maximum_length,
    numericPrecision: row.numeric_precision,
    numericScale: row.numeric_scale,
  }));

  // Get table statistics (row count, size)
  const statsResult = await executeQuery<{
    n_live_tup: number;
    table_size: number;
    table_size_pretty: string;
    table_type: string;
  }>(`
    SELECT 
      COALESCE(s.n_live_tup, 0) as n_live_tup,
      pg_total_relation_size(c.oid) as table_size,
      pg_size_pretty(pg_total_relation_size(c.oid)) as table_size_pretty,
      t.table_type
    FROM pg_catalog.pg_class c
    LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.schemaname = n.nspname AND s.relname = c.relname
    LEFT JOIN information_schema.tables t ON t.table_schema = n.nspname AND t.table_name = c.relname
    WHERE n.nspname = $1 AND c.relname = $2
  `, [schema, table]);

  if (statsResult.rows.length === 0) {
    throw new Error(`Table ${schema}.${table} not found`);
  }

  const stats = statsResult.rows[0];

  // Get index information with usage statistics
  const indexesResult = await executeQuery<{
    indexname: string;
    indexdef: string;
    index_size: string;
    idx_scan: number;
    idx_tup_read: number;
    idx_tup_fetch: number;
  }>(`
    SELECT 
      i.indexname,
      i.indexdef,
      pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size,
      COALESCE(s.idx_scan, 0) as idx_scan,
      COALESCE(s.idx_tup_read, 0) as idx_tup_read,
      COALESCE(s.idx_tup_fetch, 0) as idx_tup_fetch
    FROM pg_indexes i
    LEFT JOIN pg_stat_user_indexes s 
      ON s.schemaname = i.schemaname 
      AND s.relname = i.tablename 
      AND s.indexrelname = i.indexname
    WHERE i.schemaname = $1 AND i.tablename = $2
    ORDER BY i.indexname
  `, [schema, table]);

  const indexes: TableIndex[] = indexesResult.rows.map(row => {
    const indexDef = row.indexdef;
    const isUnique = indexDef.includes('UNIQUE INDEX');
    
    // Extract columns from index definition
    const columnsMatch = indexDef.match(/\(([^)]+)\)/);
    const columns = columnsMatch 
      ? columnsMatch[1].split(',').map(c => c.trim().replace(/^"(.*)"$/, '$1'))
      : [];

    return {
      name: row.indexname,
      columns,
      unique: isUnique,
      size: row.index_size,
      scans: row.idx_scan,
      tuples_read: row.idx_tup_read,
      tuples_fetched: row.idx_tup_fetch,
    };
  });

  // Get constraints
  const constraintsResult = await executeQuery<{
    constraint_name: string;
    constraint_type: string;
  }>(`
    SELECT 
      tc.constraint_name,
      tc.constraint_type
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = $1 AND tc.table_name = $2
    ORDER BY tc.constraint_name
  `, [schema, table]);

  const constraints: TableConstraint[] = [];

  for (const row of constraintsResult.rows) {
    // Get constraint definition
    let definition = '';
    
    if (row.constraint_type === 'FOREIGN KEY') {
      const fkResult = await executeQuery<{
        column_name: string;
        foreign_table_schema: string;
        foreign_table_name: string;
        foreign_column_name: string;
      }>(`
        SELECT 
          kcu.column_name,
          ccu.table_schema AS foreign_table_schema,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.key_column_usage kcu
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = kcu.constraint_name
          AND rc.constraint_schema = kcu.constraint_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = rc.unique_constraint_name
          AND ccu.constraint_schema = rc.unique_constraint_schema
        WHERE kcu.constraint_name = $1
          AND kcu.constraint_schema = $2
      `, [row.constraint_name, schema]);

      if (fkResult.rows.length > 0) {
        const fk = fkResult.rows[0];
        definition = `FOREIGN KEY (${fk.column_name}) REFERENCES ${fk.foreign_table_schema}.${fk.foreign_table_name}(${fk.foreign_column_name})`;
      }
    } else if (row.constraint_type === 'CHECK') {
      const checkResult = await executeQuery<{ check_clause: string }>(`
        SELECT check_clause
        FROM information_schema.check_constraints
        WHERE constraint_name = $1 AND constraint_schema = $2
      `, [row.constraint_name, schema]);

      if (checkResult.rows.length > 0) {
        definition = `CHECK (${checkResult.rows[0].check_clause})`;
      }
    } else {
      // For PRIMARY KEY and UNIQUE constraints, get the columns
      const columnsResult = await executeQuery<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.key_column_usage
        WHERE constraint_name = $1 AND constraint_schema = $2
        ORDER BY ordinal_position
      `, [row.constraint_name, schema]);

      const cols = columnsResult.rows.map(r => r.column_name).join(', ');
      definition = `${row.constraint_type} (${cols})`;
    }

    constraints.push({
      name: row.constraint_name,
      type: row.constraint_type,
      definition,
    });
  }

  return {
    schema,
    table,
    columns,
    row_count: stats.n_live_tup,
    size_bytes: stats.table_size,
    size_pretty: stats.table_size_pretty,
    indexes,
    constraints,
    table_type: stats.table_type,
  };
}

