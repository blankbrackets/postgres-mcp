/**
 * Tool: list_tables
 * Returns a simple list of all tables in the database (or filtered by schema)
 */

import { executeQuery } from '../db.js';

export interface ListTablesInput {
  schema?: string;
}

export interface TableInfo {
  schema: string;
  table: string;
  type: string; // 'BASE TABLE' or 'VIEW'
  row_count: number | null;
  size: string | null;
}

export interface ListTablesOutput {
  tables: TableInfo[];
  total_count: number;
}

/**
 * Lists all tables in the database, optionally filtered by schema
 */
export async function listTables(input: ListTablesInput = {}): Promise<ListTablesOutput> {
  const { schema } = input;

  let query = `
    SELECT 
      t.table_schema as schema,
      t.table_name as table,
      t.table_type as type,
      COALESCE(s.n_live_tup, 0) as row_count,
      pg_size_pretty(pg_total_relation_size(
        ('"' || t.table_schema || '"."' || t.table_name || '"')::regclass
      )) as size
    FROM information_schema.tables t
    LEFT JOIN pg_stat_user_tables s 
      ON s.schemaname = t.table_schema 
      AND s.relname = t.table_name
    WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
  `;

  const params: string[] = [];
  
  if (schema) {
    query += ` AND t.table_schema = $1`;
    params.push(schema);
  }

  query += ` ORDER BY t.table_schema, t.table_name`;

  const result = await executeQuery<{
    schema: string;
    table: string;
    type: string;
    row_count: string | null;
    size: string | null;
  }>(query, params);

  const tables: TableInfo[] = result.rows.map(row => ({
    schema: row.schema,
    table: row.table,
    type: row.type,
    row_count: row.row_count ? parseInt(row.row_count, 10) : null,
    size: row.size,
  }));

  return {
    tables,
    total_count: tables.length,
  };
}

