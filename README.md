# Postgres MCP Server

A Model Context Protocol (MCP) server that provides read-only access to PostgreSQL database metadata and analysis tools. This server enables LLMs like Claude or Cursor's built-in LLM to analyze database schemas, query patterns, and suggest optimizations without making any modifications to the database.

## Features

- **Read-Only Access**: All connections are configured as read-only, preventing any data modifications
- **Comprehensive Metadata**: Access complete database schema information including tables, columns, indexes, and constraints
- **Performance Analysis**: Query statistics, I/O metrics, cache hit ratios, and index usage data
- **Optimization Suggestions**: Data-driven insights for schema design, indexing strategies, and performance tuning
- **Safe and Secure**: Input validation, parameterized queries, and connection-level read-only enforcement

## Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **PostgreSQL Database**: Access to a Postgres database with read permissions
- **Read-Only Database User**: Recommended for security (see Security section)

## Installation

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

4. Configure your database connection in `.env`:

```env
DATABASE_URL=postgresql://readonly_user:password@localhost:5432/dbname
QUERY_TIMEOUT=30000  # Optional: query timeout in milliseconds
```

## Building

Compile the TypeScript code to JavaScript:

```bash
npm run build
```

This will create the compiled code in the `build/` directory.

## Running

### Production Mode

After building, run the compiled server:

```bash
npm start
```

### Development Mode

Run directly with TypeScript (no build step required):

```bash
npm run dev
```

## Integration

### Integration with Cursor

1. Build the project: `npm run build`
2. Add to your Cursor MCP configuration file (typically `.cursor/mcp.json` or in Cursor settings):

```json
{
  "mcpServers": {
    "postgres-analyzer": {
      "command": "node",
      "args": ["/absolute/path/to/postgres-mcp/build/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://readonly_user:password@localhost:5432/dbname"
      }
    }
  }
}
```

3. Restart Cursor to load the MCP server

### Integration with Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "postgres-analyzer": {
      "command": "node",
      "args": ["/absolute/path/to/postgres-mcp/build/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://readonly_user:password@localhost:5432/dbname"
      }
    }
  }
}
```

Restart Claude Desktop after making changes.

## Available Resources

### `postgres://database/metadata`

Returns complete database schema metadata including:
- All schemas (excluding system schemas)
- Tables and views per schema
- Column details (name, type, nullable, default, precision)
- Indexes (columns, type, uniqueness)
- Constraints (primary keys, foreign keys, unique, check)

**Example Usage in LLM:**
```
Can you show me the structure of my database?
```

### `postgres://system/catalog-reference`

**📚 PostgreSQL System Catalog Reference**

**IMPORTANT**: Read this resource before using `execute_query` to write custom SQL!

Documents PostgreSQL system tables and views with **correct column names** to prevent common errors.

**Critical information:**
- **Column naming inconsistency**: `pg_stat_user_tables` uses `relname` (not `tablename`!)
- **View-specific columns**: Each PostgreSQL system view has different column names
- **Common mistakes**: Using `tablename` in `pg_stat_*` views (should be `relname`)
- **Join examples**: How to correctly join `pg_indexes` with `pg_stat_user_indexes`

**Example Usage in LLM:**
```
Before running custom queries, read the system catalog reference to learn the correct column names.
```

**Why this matters:**
```sql
-- ❌ WRONG - Will fail with "column tablename does not exist"
SELECT tablename FROM pg_stat_user_tables;

-- ✅ CORRECT
SELECT relname FROM pg_stat_user_tables;
```

## Available Tools

### `comprehensive_database_analysis`

**🎯 START HERE!** When asked to "optimize my database" or "find all issues", use this tool first!

**What it does:**
- Scans the **ENTIRE database** for performance issues
- Identifies **ALL critical problems** (not just a few tables)
- Creates a **prioritized action plan** with step-by-step workflow
- Tells you **EXACTLY** which tools to use on which tables
- Prevents missing optimization opportunities

**Input:** None (analyzes everything automatically)

**Returns:**
- **Summary**: Health score, critical issues count, warnings
- **Critical issues**: With severity, affected tables, recommended tools
- **Analysis workflow**: Step-by-step plan with specific tool calls and parameters
- **Tables requiring attention**: Prioritized list (critical → high → medium → low)
- **Quick wins**: Immediate optimizations (drop unused indexes, etc.)
- **Long-term improvements**: Strategic recommendations

**Use this when:**
- "Optimize my database"
- "Find all performance issues"
- "Complete database analysis"
- "What needs to be fixed?"

**Example output:**
```json
{
  "summary": {"health_score": 65, "critical_issues": 3},
  "critical_issues": [
    {
      "severity": "critical",
      "issue": "15 tables have excessive sequential scans",
      "recommended_tool": "suggest_indexing_strategies",
      "recommended_action": "Add indexes to reduce sequential scans"
    }
  ],
  "analysis_workflow": [
    {"step": 1, "tool_to_use": "get_database_health"},
    {"step": 3, "tool_to_use": "get_query_statistics", "parameters": {"schema": "public", "table": "sync_jobs"}},
    ...complete workflow for all tables
  ]
}
```

**This tool ensures comprehensive analysis - nothing gets missed!**

---

### `execute_query`

**⚠️ LAST RESORT ONLY!** Use this only when specialized tools cannot provide the data you need.

The specialized tools (`get_query_statistics`, `suggest_indexing_strategies`, etc.) are optimized for database analysis and should be preferred.

**CRITICAL SECURITY NOTE**: This tool is **STRICTLY READ-ONLY**. The database connection enforces read-only mode at the connection level (`default_transaction_read_only=on`). Any attempt to modify data will be rejected.

**Input:**
```json
{
  "query": "SELECT column1, column2 FROM my_table WHERE condition = 'value'",
  "maxRows": 100  // Optional: default 100, LIMIT will be added if not present
}
```

**Allowed queries:**
- ✅ `SELECT` statements - Data retrieval
- ✅ `WITH` (CTE) queries - Common Table Expressions
- ✅ `EXPLAIN` / `EXPLAIN ANALYZE` - Query execution plans
- ✅ `SHOW` commands - Configuration settings
- ✅ `TABLE` - PostgreSQL shorthand for `SELECT * FROM table`
- ✅ `VALUES` - Generate rows without tables (e.g., `VALUES (1, 'a'), (2, 'b')`)

**Prohibited (will be rejected):**
- ❌ `INSERT`, `UPDATE`, `DELETE`
- ❌ `DROP`, `CREATE`, `ALTER`, `TRUNCATE`
- ❌ `GRANT`, `REVOKE`
- ❌ `COMMIT`, `ROLLBACK`, `BEGIN`
- ❌ `SET`, `COPY`

**Returns:**
- Column names
- Rows (limited by maxRows)
- Row count
- Execution time in milliseconds

**Use this tool when:**
- You need to run custom queries
- Other tools don't provide the specific data needed
- You want to explore data relationships

**Example queries:**
```sql
-- Find users created in the last 30 days
SELECT COUNT(*) FROM asp_net_users WHERE created_at > NOW() - INTERVAL '30 days';

-- Complex join across multiple tables
SELECT e.*, o.name as org_name 
FROM exemption_requests e 
JOIN organizations o ON e.organization_id = o.id 
WHERE e.status = 'pending';

-- Quick table preview using TABLE shorthand
TABLE asp_net_users LIMIT 10;

-- Generate test data with VALUES
VALUES (1, 'test'), (2, 'demo'), (3, 'sample');

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM exemption_requests WHERE status = 'pending';
```

---

### `list_tables`

**⭐ Always use this first!** Lists all tables in the database with their schemas, types, row counts, and sizes.

**Input:**
```json
{
  "schema": "public"  // Optional: filter by schema
}
```

**Returns:**
- List of all tables with schema, name, type, row count, and size
- Total count of tables

**Example:** Call without parameters to see all tables, or with `{"schema": "public"}` to see only public schema tables.

### `get_table_info`

Get detailed information about a specific table. Use `list_tables` first to find available tables.

**Input:**
```json
{
  "schema": "public",
  "table": "users"
}
```

**Returns:**
- Column details with data types
- Row count and table size
- Index information with usage statistics
- Constraint definitions

### `get_query_statistics`

Get query and I/O statistics for a table.

**Input:**
```json
{
  "schema": "public",
  "table": "orders"
}
```

**Returns:**
- Sequential vs index scan counts
- Cache hit ratios
- Index usage statistics per index
- Bloat estimation
- Last vacuum/analyze timestamps

### `suggest_schema_optimizations`

Analyze table schema and return optimization data.

**Input:**
```json
{
  "schema": "public",
  "table": "products"
}
```

**Returns:**
- Column-level statistics (nullability, cardinality, average width)
- Foreign key analysis (indexed vs unindexed)
- Table bloat metrics
- Data type issues and suggestions
- Total size and row count

### `suggest_indexing_strategies`

Analyze indexing strategy and return optimization data.

**Input:**
```json
{
  "schema": "public",
  "table": "transactions",
  "workloadSample": []  // Optional: future enhancement
}
```

**Returns:**
- Index usage statistics (scans, size, tuples)
- Unused indexes
- Unindexed foreign key columns
- Duplicate/redundant indexes
- Table scan analysis (sequential vs index scan ratio)

### `analyze_query_performance`

**🔥 Essential for finding slow queries!** Analyzes query performance using pg_stat_statements or EXPLAIN plans.

**Input:**
```json
{
  "query": "SELECT * FROM users WHERE email = 'test@example.com'",  // Optional: specific query to analyze
  "topN": 10  // Optional: number of slow queries to return (default: 10)
}
```

**Returns:**
- **Slow queries**: Top N queries by total execution time with:
  - Call counts, mean/max execution times
  - Cache hit ratios
  - Rows returned
- **Query plans**: EXPLAIN output for specific queries
- **Recommendations**: Specific optimization suggestions

**Usage:**
- Call without parameters to see your slowest queries
- Provide a specific query to get its execution plan and recommendations

**Note**: For best results, enable `pg_stat_statements` extension:
```sql
CREATE EXTENSION pg_stat_statements;
```

### `get_database_health`

**⭐ Start here!** Comprehensive database health check that identifies performance issues across the entire database.

**Input:** None (no parameters needed)

**Returns:**
- **Database size**: Total size in bytes and human-readable format
- **Cache performance**: Overall cache hit ratios (buffer cache, index cache)
- **Table statistics**: Tables never vacuumed/analyzed, tables with high bloat
- **Index statistics**: Total indexes, unused indexes, total index size
- **Connection info**: Current connections vs max, utilization percentage
- **Performance issues**: List of detected problems
- **Recommendations**: Actionable suggestions to improve performance

**This tool automatically detects:**
- Low cache hit ratios (< 90%)
- Tables that have never been vacuumed or analyzed
- Tables with high bloat (> 20% dead tuples)
- Unused indexes wasting space
- High connection utilization & excessive idle connections
- Large tables with excessive sequential scans
- **NEW**: Replication lag and inactive replication slots
- **NEW**: Invalid database constraints  
- **NEW**: Sequences at risk of reaching max value (>75% used)

## Security Recommendations

### 1. Create a Read-Only Database User

It's highly recommended to create a dedicated read-only user for this MCP server:

```sql
-- Create read-only user
CREATE USER readonly_user WITH PASSWORD 'secure_password';

-- Grant connect privilege
GRANT CONNECT ON DATABASE your_database TO readonly_user;

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO readonly_user;

-- Grant SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;

-- Grant SELECT on future tables (optional)
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT ON TABLES TO readonly_user;

-- Grant access to pg_stat views (for statistics)
GRANT pg_read_all_stats TO readonly_user;
```

### 2. Environment Variable Security

- **Never commit** `.env` files to version control
- Use environment-specific configuration management
- Rotate credentials regularly
- Use strong passwords for database users

### 3. Connection Security

- The server automatically enables read-only transaction mode (`default_transaction_read_only=on`)
- All queries use parameterized statements to prevent SQL injection
- Input validation is performed on schema and table names
- No tools expose write operations (INSERT/UPDATE/DELETE/DROP)

### 4. Network Security

- Use SSL/TLS for database connections in production
- Restrict database access by IP address if possible
- Use connection pooling limits to prevent resource exhaustion

## How It Works

1. **Connection**: The server connects to PostgreSQL using the `DATABASE_URL` environment variable
2. **Read-Only Mode**: Connection string is modified to include `default_transaction_read_only=on`
3. **MCP Protocol**: Exposes resources and tools via the Model Context Protocol
4. **stdio Transport**: Communicates with LLMs via stdin/stdout
5. **Metadata Queries**: Uses `information_schema` and `pg_catalog` system tables
6. **Statistics**: Leverages `pg_stat_*` views for performance data

## Logging

The MCP server logs all activity to both:
1. **File**: `logs/postgres-mcp-server.log` in the project directory
2. **stderr**: Which Claude Desktop captures in its own logs

### Viewing Server Logs

**Local log file:**
```bash
# View the entire log
cat logs/postgres-mcp-server.log

# Follow logs in real-time
tail -f logs/postgres-mcp-server.log
```

**Claude Desktop logs (macOS):**
```bash
# View MCP server logs
tail -n 50 -f ~/Library/Logs/Claude/mcp*.log

# Or view specific server logs
tail -f ~/Library/Logs/Claude/mcp-server-postgres-analyzer.log
```

### Log Levels

You can control the verbosity by setting the `LOG_LEVEL` environment variable:
- `error` - Only errors
- `warn` - Warnings and errors
- `info` - General information (default)
- `debug` - Detailed debugging information

Add to your configuration:
```json
{
  "mcpServers": {
    "postgres-analyzer": {
      "command": "node",
      "args": ["/path/to/postgres-mcp/build/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

## Troubleshooting

### Connection Issues

**Error: DATABASE_URL environment variable is required**
- Ensure `.env` file exists and contains `DATABASE_URL`
- Check that the environment variable is properly formatted

**Error: Database connection test failed**
- Verify database credentials are correct
- Check that the database server is running and accessible
- Ensure firewall/security groups allow connections
- Test connection using `psql` with the same connection string

### Permission Issues

**Error: permission denied for table/schema**
- Ensure the database user has SELECT privileges
- Grant necessary permissions (see Security section)
- Check that `pg_read_all_stats` role is granted for statistics access

### Query Timeout

**Error: Query execution failed: timeout**
- Increase `QUERY_TIMEOUT` in `.env` (default: 30000ms)
- Check for expensive queries on large tables
- Ensure database has proper indexes for metadata queries

### Integration Issues

**MCP server not appearing in Cursor/Claude**
- Verify the absolute path to `build/index.js` is correct
- Check that the project is built (`npm run build`)
- Restart the application after configuration changes
- Check application logs for errors

## Development

### Project Structure

```
postgres-mcp/
├── src/
│   ├── index.ts                          # Main MCP server entry point
│   ├── db.ts                             # Database connection utilities
│   ├── tools/                            # Tool implementations
│   │   ├── getTableInfo.ts
│   │   ├── getQueryStatistics.ts
│   │   ├── suggestSchemaOptimizations.ts
│   │   └── suggestIndexingStrategies.ts
│   └── resources/
│       └── databaseMetadata.ts           # Database metadata resource
├── build/                                # Compiled JavaScript (gitignored)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled server
- `npm run dev` - Run server in development mode with tsx
- `npm run clean` - Remove build directory

## Example Usage with LLM

Once integrated with Cursor or Claude, you can ask questions like:

**🎯 Comprehensive Analysis (BEST - Start Here!):**
- **"Do a comprehensive analysis and optimization of my database"** ⭐ Most thorough!
- **"Find ALL performance issues in my database and create an action plan"**
- **"Optimize my database - analyze everything and tell me what to fix"**

These prompts trigger `comprehensive_database_analysis` which creates a complete roadmap!

**🏥 Quick Health Check:**
- "What's the overall health of my database?"
- "Give me database health metrics"

**🐌 Query Performance Analysis:**
- "What are my slowest queries?"
- "Show me the top 20 queries by execution time"
- "Analyze this query: SELECT * FROM exemption_requests WHERE status = 'pending'"
- "Why is this query slow?"

**🔍 Custom Query Execution:**
- "Execute: SELECT COUNT(*) FROM asp_net_users WHERE created_at > NOW() - INTERVAL '7 days'"
- "Run this query: SELECT * FROM exemption_requests WHERE status = 'approved' ORDER BY created_at DESC LIMIT 10"
- "Show me data from: SELECT organization_id, COUNT(*) FROM exemption_requests GROUP BY organization_id"

**📊 Database Discovery:**
- "What tables exist in my database?"
- "Show me all tables in the public schema"
- "What's the structure of my database?"

**🔍 Table Analysis:**
- "Show me the structure of the exemption_requests table"
- "Analyze the asp_net_users table for optimization opportunities"
- "What are the indexes on the organizations table?"

**⚡ Performance Optimization:**
- "Which indexes are not being used on the sync_jobs table?"
- "What foreign keys are missing indexes?"
- "Show me query statistics for the exemption_requests table"
- "What's the cache hit ratio for the programs table?"
- "Find tables with high bloat"
- "Which tables need vacuuming?"

**💡 Optimization Suggestions:**
- "Suggest optimizations for the messages table"
- "What indexing improvements can be made to the notifications table?"
- "How can I improve the performance of the sync_jobs table?"

The LLM will automatically:
1. Use `get_database_health` for overall assessment
2. Use `analyze_query_performance` to find slow queries
3. Use `list_tables` to discover available tables
4. Use table-specific tools for detailed analysis
5. Provide data-driven optimization recommendations

## License

MIT

## Contributing

Contributions are welcome! Please ensure:
- All code follows TypeScript best practices
- Security considerations are maintained
- Read-only constraints are not bypassed
- Documentation is updated for new features

## Support

For issues, questions, or contributions, please refer to the project repository.

