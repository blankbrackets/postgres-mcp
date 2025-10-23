/**
 * Database metadata resource
 * Returns comprehensive database structure including schemas, tables, columns, indexes, and constraints
 */

import { executeQuery } from '../db.js';

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  characterMaximumLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
  type: string;
}

export interface ConstraintInfo {
  name: string;
  type: string;
  columns: string[];
  foreignSchema?: string;
  foreignTable?: string;
  foreignColumns?: string[];
}

export interface TableInfo {
  name: string;
  type: string; // 'BASE TABLE' or 'VIEW'
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  constraints: ConstraintInfo[];
}

export interface SchemaInfo {
  name: string;
  tables: TableInfo[];
}

export interface DatabaseMetadata {
  schemas: SchemaInfo[];
}

/**
 * Fetches complete database metadata
 */
export async function getDatabaseMetadata(): Promise<DatabaseMetadata> {
  // Get all user schemas (excluding system schemas)
  const schemasResult = await executeQuery<{ schema_name: string }>(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY schema_name
  `);

  const schemas: SchemaInfo[] = [];

  for (const schemaRow of schemasResult.rows) {
    const schemaName = schemaRow.schema_name;
    
    // Get all tables and views in this schema
    const tablesResult = await executeQuery<{ 
      table_name: string;
      table_type: string;
    }>(`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = $1
      ORDER BY table_name
    `, [schemaName]);

    const tables: TableInfo[] = [];

    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.table_name;
      
      // Get columns
      const columns = await getTableColumns(schemaName, tableName);
      
      // Get indexes
      const indexes = await getTableIndexes(schemaName, tableName);
      
      // Get constraints
      const constraints = await getTableConstraints(schemaName, tableName);

      tables.push({
        name: tableName,
        type: tableRow.table_type,
        columns,
        indexes,
        constraints,
      });
    }

    schemas.push({
      name: schemaName,
      tables,
    });
  }

  return { schemas };
}

/**
 * Gets column information for a specific table
 */
async function getTableColumns(schema: string, table: string): Promise<ColumnInfo[]> {
  const result = await executeQuery<{
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

  return result.rows.map(row => ({
    name: row.column_name,
    type: row.data_type,
    nullable: row.is_nullable === 'YES',
    default: row.column_default,
    characterMaximumLength: row.character_maximum_length,
    numericPrecision: row.numeric_precision,
    numericScale: row.numeric_scale,
  }));
}

/**
 * Gets index information for a specific table
 */
async function getTableIndexes(schema: string, table: string): Promise<IndexInfo[]> {
  const result = await executeQuery<{
    indexname: string;
    indexdef: string;
  }>(`
    SELECT 
      indexname,
      indexdef
    FROM pg_indexes
    WHERE schemaname = $1 AND tablename = $2
    ORDER BY indexname
  `, [schema, table]);

  const indexes: IndexInfo[] = [];

  for (const row of result.rows) {
    // Parse index definition to extract details
    const indexDef = row.indexdef;
    const isUnique = indexDef.includes('UNIQUE INDEX');
    const isPrimary = row.indexname.endsWith('_pkey');
    
    // Extract columns from index definition (simplified parsing)
    const columnsMatch = indexDef.match(/\(([^)]+)\)/);
    const columns = columnsMatch 
      ? columnsMatch[1].split(',').map(c => c.trim().replace(/^"(.*)"$/, '$1'))
      : [];

    // Determine index type
    let type = 'btree'; // default
    if (indexDef.includes('USING gin')) type = 'gin';
    else if (indexDef.includes('USING gist')) type = 'gist';
    else if (indexDef.includes('USING hash')) type = 'hash';
    else if (indexDef.includes('USING brin')) type = 'brin';

    indexes.push({
      name: row.indexname,
      columns,
      unique: isUnique,
      primary: isPrimary,
      type,
    });
  }

  return indexes;
}

/**
 * Gets constraint information for a specific table
 */
async function getTableConstraints(schema: string, table: string): Promise<ConstraintInfo[]> {
  // Get basic constraints
  const constraintsResult = await executeQuery<{
    constraint_name: string;
    constraint_type: string;
  }>(`
    SELECT 
      constraint_name,
      constraint_type
    FROM information_schema.table_constraints
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY constraint_name
  `, [schema, table]);

  const constraints: ConstraintInfo[] = [];

  for (const row of constraintsResult.rows) {
    const constraintName = row.constraint_name;
    const constraintType = row.constraint_type;

    // Get columns involved in this constraint
    const columnsResult = await executeQuery<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.constraint_column_usage
      WHERE constraint_schema = $1 
        AND table_name = $2 
        AND constraint_name = $3
      ORDER BY ordinal_position
    `, [schema, table, constraintName]);

    const columns = columnsResult.rows.map(r => r.column_name);

    const constraint: ConstraintInfo = {
      name: constraintName,
      type: constraintType,
      columns,
    };

    // If it's a foreign key, get the referenced table
    if (constraintType === 'FOREIGN KEY') {
      const fkResult = await executeQuery<{
        foreign_schema: string;
        foreign_table: string;
        foreign_column: string;
      }>(`
        SELECT 
          ccu.table_schema AS foreign_schema,
          ccu.table_name AS foreign_table,
          ccu.column_name AS foreign_column
        FROM information_schema.referential_constraints rc
        JOIN information_schema.constraint_column_usage ccu
          ON rc.unique_constraint_name = ccu.constraint_name
          AND rc.unique_constraint_schema = ccu.constraint_schema
        WHERE rc.constraint_schema = $1
          AND rc.constraint_name = $2
      `, [schema, constraintName]);

      if (fkResult.rows.length > 0) {
        constraint.foreignSchema = fkResult.rows[0].foreign_schema;
        constraint.foreignTable = fkResult.rows[0].foreign_table;
        constraint.foreignColumns = fkResult.rows.map(r => r.foreign_column);
      }
    }

    constraints.push(constraint);
  }

  return constraints;
}

