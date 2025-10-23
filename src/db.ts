/**
 * Database connection utilities for read-only Postgres access
 */

import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/**
 * Creates and returns a read-only Postgres connection pool
 * @throws {Error} If DATABASE_URL is not set or connection fails
 */
export function getReadOnlyPool(): pg.Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // Parse the connection string to add read-only options
  const url = new URL(connectionString);
  
  // Add read-only transaction mode to connection parameters
  const existingParams = url.searchParams.toString();
  const readOnlyOption = 'options=-c%20default_transaction_read_only%3Don';
  const separator = existingParams ? '&' : '';
  
  // Reconstruct connection string with read-only parameter
  const readOnlyConnectionString = 
    `${url.protocol}//${url.username}:${url.password}@${url.host}${url.pathname}?${existingParams}${separator}${readOnlyOption}`;

  const queryTimeout = process.env.QUERY_TIMEOUT 
    ? parseInt(process.env.QUERY_TIMEOUT, 10) 
    : 30000;

  pool = new Pool({
    connectionString: readOnlyConnectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: queryTimeout,
    application_name: 'postgres-mcp-server',
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
  });

  return pool;
}

/**
 * Tests the database connection
 * @throws {Error} If connection test fails
 */
export async function testConnection(): Promise<void> {
  const client = getReadOnlyPool();
  try {
    const result = await client.query('SELECT 1 as test, current_setting($1) as readonly_mode', [
      'default_transaction_read_only'
    ]);
    
    if (result.rows[0].readonly_mode !== 'on') {
      console.warn('Warning: Database connection is not in read-only mode');
    }
  } catch (error) {
    throw new Error(`Database connection test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Gracefully closes the database connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Validates that a schema and table name are safe to use in queries
 * This helps prevent SQL injection even though we use parameterized queries
 */
export function validateIdentifier(identifier: string): boolean {
  // Allow alphanumeric, underscores, hyphens, and periods
  // Parameterized queries provide the real SQL injection protection
  // This is just a basic sanity check
  return /^[a-zA-Z0-9_.-]+$/.test(identifier) && identifier.length > 0 && identifier.length < 256;
}

/**
 * Helper to execute a query with error handling
 */
export async function executeQuery<T extends pg.QueryResultRow = any>(
  query: string,
  params: any[] = []
): Promise<pg.QueryResult<T>> {
  const client = getReadOnlyPool();
  try {
    return await client.query<T>(query, params);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Query execution failed: ${message}`);
  }
}

