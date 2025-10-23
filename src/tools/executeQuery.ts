/**
 * Tool: execute_query
 * Executes arbitrary READ-ONLY SQL queries
 * 
 * SECURITY: This tool enforces read-only execution through:
 * 1. Connection-level read-only mode (default_transaction_read_only=on)
 * 2. Basic SQL validation to reject obvious write operations
 * 3. Query timeout to prevent long-running queries
 * 
 * WARNING: Despite these protections, users should NEVER attempt to modify data.
 */

import { executeQuery } from '../db.js';

export interface ExecuteQueryInput {
  query: string;
  maxRows?: number;
}

export interface ExecuteQueryOutput {
  columns: string[];
  rows: any[];
  rowCount: number;
  executionTimeMs: number;
  warning?: string;
}

/**
 * Validates that a query appears to be read-only
 * This is a basic check - the real protection is connection-level read-only mode
 */
function validateReadOnlyQuery(query: string): { valid: boolean; reason?: string } {
  const normalizedQuery = query.trim().toLowerCase();
  
  // List of prohibited statements
  const writeKeywords = [
    'insert ',
    'update ',
    'delete ',
    'drop ',
    'create ',
    'alter ',
    'truncate ',
    'grant ',
    'revoke ',
    'commit',
    'rollback',
    'begin',
    'start transaction',
    'set ',
    'copy ',
  ];

  for (const keyword of writeKeywords) {
    if (normalizedQuery.includes(keyword)) {
      return {
        valid: false,
        reason: `Query contains prohibited keyword: "${keyword}". This tool only supports SELECT queries.`,
      };
    }
  }

  // Ensure query starts with allowed read-only commands (allowing any whitespace after keyword)
  const startsWithAllowed = 
    /^select\s/i.test(normalizedQuery) ||
    /^with\s/i.test(normalizedQuery) ||
    /^explain\s/i.test(normalizedQuery) ||
    /^show\s/i.test(normalizedQuery) ||
    /^table\s/i.test(normalizedQuery) ||    // PostgreSQL: TABLE name = SELECT * FROM name
    /^values\s/i.test(normalizedQuery);      // VALUES (1,2), (3,4) - generate rows

  if (!startsWithAllowed) {
    return {
      valid: false,
      reason: 'Query must start with SELECT, WITH, EXPLAIN, SHOW, TABLE, or VALUES',
    };
  }

  return { valid: true };
}

/**
 * Executes an arbitrary read-only SQL query
 * 
 * IMPORTANT: This tool is READ-ONLY. The database connection is configured with
 * default_transaction_read_only=on, preventing any data modifications.
 */
export async function executeQueryTool(input: ExecuteQueryInput): Promise<ExecuteQueryOutput> {
  const { query, maxRows = 100 } = input;

  // Validate query appears to be read-only
  const validation = validateReadOnlyQuery(query);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const startTime = Date.now();
  let warning: string | undefined;

  try {
    // Add LIMIT if not present and maxRows is specified
    let finalQuery = query.trim();
    if (maxRows && !finalQuery.toLowerCase().includes('limit ')) {
      finalQuery = `${finalQuery} LIMIT ${maxRows}`;
      warning = `Added LIMIT ${maxRows} to prevent excessive results. Specify LIMIT in your query to override.`;
    }

    const result = await executeQuery(finalQuery);
    const executionTimeMs = Date.now() - startTime;

    // Extract column names
    const columns = result.fields.map(field => field.name);

    return {
      columns,
      rows: result.rows,
      rowCount: result.rows.length,
      executionTimeMs,
      warning,
    };
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    
    // Check if error is due to read-only mode
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('read-only') || errorMessage.includes('readonly')) {
      throw new Error(
        `Query rejected: Database is in read-only mode. Cannot execute INSERT, UPDATE, DELETE, or DDL statements. ` +
        `Original error: ${errorMessage}`
      );
    }
    
    // Check for common errors and provide helpful suggestions
    if (errorMessage.includes('column') && errorMessage.includes('does not exist')) {
      if (errorMessage.includes('tablename')) {
        throw new Error(
          `Column error: PostgreSQL system views use different column names. ` +
          `In pg_stat_user_tables/pg_stat_user_indexes, use "relname" instead of "tablename". ` +
          `Read the "postgres://system/catalog-reference" resource for correct column names. ` +
          `Original error: ${errorMessage}`
        );
      }
      throw new Error(
        `Query execution failed (${executionTimeMs}ms): ${errorMessage}. ` +
        `Tip: Check column names in information_schema or use list_tables/get_table_info to see available columns.`
      );
    }
    
    if (errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
      throw new Error(
        `Query execution failed (${executionTimeMs}ms): Table or view not found. ` +
        `PostgreSQL is CASE-SENSITIVE with quoted identifiers. ` +
        `Tip: Use list_tables tool first to see exact table names with correct casing. ` +
        `For example, "__EFMigrationsHistory" is different from "__efmigrationshistory". ` +
        `Original error: ${errorMessage}`
      );
    }
    
    throw new Error(`Query execution failed (${executionTimeMs}ms): ${errorMessage}`);
  }
}

