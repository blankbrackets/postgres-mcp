# Postgres MCP Server

> A TypeScript-based Model Context Protocol (MCP) server that provides AI assistants with read-only access to PostgreSQL databases for comprehensive analysis and optimization recommendations.

[![NPM Version](https://img.shields.io/npm/v/blankbrackets-postgres-mcp-server)](https://www.npmjs.com/package/blankbrackets-postgres-mcp-server)
[![Docker Pulls](https://img.shields.io/docker/pulls/blankbrackets/postgres-mcp-server)](https://hub.docker.com/r/blankbrackets/postgres-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

## Installation

### NPM (Recommended)

```bash
npm install -g blankbrackets-postgres-mcp-server
```

**Package**: [blankbrackets-postgres-mcp-server](https://www.npmjs.com/package/blankbrackets-postgres-mcp-server)

### Docker

```bash
docker pull blankbrackets/postgres-mcp-server:latest
```

**Image**: [blankbrackets/postgres-mcp-server](https://hub.docker.com/r/blankbrackets/postgres-mcp-server)

### From Source

```bash
git clone https://github.com/blankbrackets/postgres-mcp.git
cd postgres-mcp
npm install && npm run build
```

## Features

🎯 **Comprehensive Database Analysis** - Systematic analysis of entire database with prioritized action plans  
🔒 **Read-Only by Design** - Multi-layer protection ensures no data modifications  
📊 **10 Specialized Tools** - From table discovery to query performance analysis  
🤖 **AI-Optimized** - Designed specifically for LLM-based database optimization  
📈 **Production-Ready** - Extensive logging, error handling, and security features  
⚡ **Fast Performance** - Sub-50ms tool execution for interactive use  

## What It Detects

- **Performance Issues**: Slow queries, missing indexes, excessive sequential scans
- **Index Problems**: Unused indexes, unindexed foreign keys, duplicate indexes  
- **Schema Issues**: Poor data types, high null rates, bloat
- **Health Problems**: Replication lag, invalid constraints, sequences near max value
- **Maintenance Needs**: Tables needing VACUUM/ANALYZE, connection issues

## Quick Start

### Option 1: NPM (Easiest)

Install the published package globally:

```bash
npm install -g blankbrackets-postgres-mcp-server
```

Then configure in Claude Desktop:

```json
{
  "mcpServers": {
    "postgres-analyzer": {
      "command": "blankbrackets-postgres-mcp-server",
      "env": {
        "DATABASE_URL": "postgresql://readonly_user:password@127.0.0.1:5432/your_db"
      }
    }
  }
}
```

Restart Claude Desktop and start analyzing!

### Option 2: Docker

```bash
# Build the image
docker build -t postgres-mcp-server .

# Run with your database
docker run -i \
  -e DATABASE_URL="postgresql://readonly_user:password@host.docker.internal:5432/your_db" \
  -v $(pwd)/logs:/app/logs \
  postgres-mcp-server
```

See [`docs/DOCKER.md`](docs/DOCKER.md) for detailed Docker instructions.

### Option 3: From Source

```bash
# Clone the repository
git clone https://github.com/blankbrackets/postgres-mcp.git
cd postgres-mcp

# Install dependencies
npm install

# Build
npm run build

# Configure
cp env.example .env
# Edit .env with your DATABASE_URL

# Run
npm start
```

### Configuration

**Environment Variables:**
```bash
DATABASE_URL=postgresql://readonly_user:password@127.0.0.1:5432/your_database
LOG_LEVEL=info              # Optional: error, warn, info, debug
QUERY_TIMEOUT=30000         # Optional: Query timeout in ms
```

### Integration with AI Assistants

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

**Using NPM package** (recommended after `npm install -g blankbrackets-postgres-mcp-server`):
```json
{
  "mcpServers": {
    "postgres-analyzer": {
      "command": "blankbrackets-postgres-mcp-server",
      "env": {
        "DATABASE_URL": "postgresql://readonly_user:password@127.0.0.1:5432/your_database"
      }
    }
  }
}
```

**Using local build** (for development):
```json
{
  "mcpServers": {
    "postgres-analyzer": {
      "command": "node",
      "args": ["/absolute/path/to/postgres-mcp/build/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://readonly_user:password@127.0.0.1:5432/your_database"
      }
    }
  }
}
```

See [`examples/`](examples/) for more configuration examples including Cursor and Docker.

### 4. Usage

Restart your MCP client (Claude Desktop, Cursor, etc.) and ask:

```
Do a comprehensive analysis and optimization of my database
```

The AI will systematically analyze your database and provide actionable recommendations.

## Tools

### 🎯 `comprehensive_database_analysis` - Start Here!

Scans the **entire** database for issues and creates a complete action plan.

**Use when:** "Optimize my database", "Find all issues", "Complete analysis"

**Returns:**
- Health score and critical issues summary
- Prioritized list of tables requiring attention
- Step-by-step analysis workflow
- Quick wins and long-term improvements

### ⭐ `get_database_health` - Overall Health Check

Database-wide metrics and health assessment.

**Returns:**
- Cache performance (hit ratios)
- Table statistics (vacuum, analyze, bloat)
- Index statistics (unused indexes)
- Connection utilization (active vs idle)
- Replication health (lag, slots)
- Constraint health (invalid constraints)
- Sequence health (near max value warnings)

### 📋 `list_tables` - Table Discovery

Lists all tables with schemas, types, row counts, and sizes.

**Use before** any table-specific tools to get exact table names.

### 🔥 `analyze_query_performance` - Find Slow Queries

Identifies slowest queries using `pg_stat_statements` or analyzes specific queries with EXPLAIN.

**Returns:**
- Top N slowest queries by execution time
- Query statistics (calls, mean/max time, cache hits)
- EXPLAIN plans for specific queries
- Optimization recommendations

**Note**: Install `pg_stat_statements` extension for best results.

### 📊 `get_query_statistics` - Table Performance Stats

**Essential for table analysis!** Provides detailed query/IO statistics for a specific table.

**Returns:**
- Sequential vs index scan counts
- Cache hit ratios (buffer cache, index cache)
- Insert/update/delete statistics
- Per-index usage statistics
- Bloat estimation
- Last vacuum/analyze timestamps

### 🎯 `suggest_indexing_strategies` - Index Optimization

Analyzes indexing for a specific table.

**Returns:**
- Index usage statistics
- Unused indexes (never scanned)
- Missing indexes on foreign keys
- Duplicate/redundant indexes
- High sequential scan warnings

### 🏗️ `suggest_schema_optimizations` - Schema Design

Analyzes schema design for a specific table.

**Returns:**
- Column statistics (nullability, cardinality, average width)
- Foreign key analysis (indexed vs unindexed)
- Table bloat metrics
- Data type issues (TEXT with low cardinality, oversized VARCHAR)

### 📝 `get_table_info` - Table Structure

Returns table structure: columns, data types, indexes, and constraints.

### ⚠️ `execute_query` - Custom SQL (Last Resort)

Execute custom READ-ONLY SQL queries.

**Use only when** specialized tools cannot provide the data.

**Allowed:** SELECT, WITH, EXPLAIN, SHOW, TABLE, VALUES  
**Blocked:** INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, and all write operations

## Resources

### `postgres://database/metadata`

Complete schema structure with all schemas, tables, columns, indexes, and constraints.

### `postgres://system/catalog-reference`

PostgreSQL system catalog documentation to prevent common query errors.

**Read this before using `execute_query`!**

## Security

### Read-Only Enforcement

The server is **read-only by design** with multiple protection layers:

1. **Connection Level**: `default_transaction_read_only=on`
2. **SQL Validation**: Blocks write keywords (INSERT, UPDATE, DELETE, etc.)
3. **Code Level**: No write operations exposed in any tool
4. **Database User**: Recommend SELECT-only privileges (see below)

### Setting Up a Read-Only User

```sql
-- Create read-only user
CREATE USER postgres_mcp_readonly WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE your_database TO postgres_mcp_readonly;
GRANT USAGE ON SCHEMA public TO postgres_mcp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO postgres_mcp_readonly;
GRANT pg_read_all_stats TO postgres_mcp_readonly;
```

See [`examples/setup-readonly-user.sql`](examples/setup-readonly-user.sql) for complete setup.

### Best Practices

- ✅ Use a dedicated read-only database user
- ✅ Never commit `.env` files to version control
- ✅ Use SSL/TLS for database connections in production
- ✅ Rotate credentials regularly
- ✅ Limit database access by IP if possible

## Example Prompts

See [`examples/example-prompts.md`](examples/example-prompts.md) for comprehensive examples.

**Recommended workflow:**

```
1. "Do a comprehensive analysis and optimization of my database"
   → Creates complete action plan

2. "What are my slowest queries?"
   → Identifies performance bottlenecks

3. "List all tables"
   → Discovers database structure

4. "Analyze the [table_name] table"
   → Deep dive into specific tables
```

## Configuration

### Environment Variables

```bash
DATABASE_URL=postgresql://user:password@host:port/database  # Required
QUERY_TIMEOUT=30000      # Optional: Query timeout in ms (default: 30000)
LOG_LEVEL=info           # Optional: error, warn, info, debug (default: info)
```

### Logging

Logs are written to:
- **File**: `logs/postgres-mcp-server.log` (rotated at 10MB, 5 files kept)
- **stderr**: Captured by Claude Desktop/Cursor for debugging

```bash
# View logs
tail -f logs/postgres-mcp-server.log

# Enable debug logging
# Add to config: "LOG_LEVEL": "debug"
```

## Development

```bash
# Install dependencies
npm install

# Development mode (with auto-reload)
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Clean build directory
npm run clean
```

## Architecture

- **TypeScript** with official `@modelcontextprotocol/sdk`
- **Stdio transport** for Claude Desktop and Cursor compatibility
- **PostgreSQL** client via `pg` library
- **Winston logging** with file rotation
- **ES2022 modules** with full type safety

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for detailed architecture documentation.

## Troubleshooting

### Common Issues

**Server won't start:**
- Check `DATABASE_URL` is set
- Verify database is accessible
- View logs: `tail -f logs/postgres-mcp-server.log`

**Tool execution fails:**
- Use `list_tables` first to discover exact table names
- Check PostgreSQL permissions
- Read `postgres://system/catalog-reference` resource

**Case sensitivity errors:**
- PostgreSQL is case-sensitive with quoted identifiers
- Use exact table names from `list_tables`
- Quote mixed-case tables: `"MyTable"`

See [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) for detailed troubleshooting.

## How It Works

1. **Connection**: Connects to PostgreSQL with read-only mode enforced
2. **Discovery**: LLM uses `list_tables` to see available tables
3. **Analysis**: Uses specialized tools to gather metrics
4. **Recommendations**: LLM analyzes data and suggests optimizations

All operations are read-only - the database cannot be modified.

## Requirements

- **Node.js**: 18.0.0 or higher
- **PostgreSQL**: 9.6 or higher
- **Database Access**: Read permissions (SELECT)

**Optional but recommended:**
- `pg_stat_statements` extension for query performance analysis

## PostgreSQL System Catalog Reference

The server queries PostgreSQL system tables like:
- `information_schema.*` - ANSI SQL standard metadata
- `pg_stat_user_tables` - Table statistics
- `pg_stat_user_indexes` - Index usage
- `pg_indexes` - Index definitions

**Important**: Column names vary between views. See [`docs/POSTGRESQL_REFERENCE.md`](docs/POSTGRESQL_REFERENCE.md).

## Docker Support

### Using Docker

```bash
# Build
docker build -t postgres-mcp-server .

# Run
docker run -i \
  -e DATABASE_URL="postgresql://user:pass@host.docker.internal:5432/db" \
  postgres-mcp-server
```

### Using with Docker Compose

See [`examples/docker-compose.yml`](examples/docker-compose.yml):

```bash
docker-compose -f examples/docker-compose.yml up
```

### Docker Hub ✅ Published

Pre-built multi-architecture images available:

```bash
# Pull latest version
docker pull blankbrackets/postgres-mcp-server:latest

# Or specific version
docker pull blankbrackets/postgres-mcp-server:1.0.0

# Run directly
docker run -i \
  -e DATABASE_URL="postgresql://user:pass@host.docker.internal:5432/db" \
  blankbrackets/postgres-mcp-server:latest
```

**Supported platforms**: linux/amd64, linux/arm64

See [`docs/DOCKER.md`](docs/DOCKER.md) for comprehensive Docker documentation.

## Published Packages ✅

This server is available on:

- ✅ **NPM Registry** - `blankbrackets-postgres-mcp-server` ([View on NPM](https://www.npmjs.com/package/blankbrackets-postgres-mcp-server))
- ✅ **Docker Hub** - `blankbrackets/postgres-mcp-server` ([View on Docker Hub](https://hub.docker.com/r/blankbrackets/postgres-mcp-server))
- ✅ **GitHub** - Source code and releases ([View on GitHub](https://github.com/blankbrackets/postgres-mcp))

## Contributing

Contributions are welcome! Please see [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) for guidelines.

### Areas for Contribution

- Additional analysis tools
- Performance improvements
- Better error messages
- Documentation improvements
- Bug fixes
- Translations
- Integration examples

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/blankbrackets/postgres-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/blankbrackets/postgres-mcp/discussions)
- **Logs**: Check `logs/postgres-mcp-server.log` for debugging
- **Documentation**: See [`docs/`](docs/) folder

## Acknowledgments

Built with:
- [Model Context Protocol](https://modelcontextprotocol.io) by Anthropic
- [PostgreSQL](https://www.postgresql.org/)
- [Node.js](https://nodejs.org/) and [TypeScript](https://www.typescriptlang.org/)
- [Winston](https://github.com/winstonjs/winston) for logging

## Related Projects

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Postgres MCP Pro](https://github.com/crystaldba/postgres-mcp) - Python-based alternative

---

**Made with ❤️ for the MCP and PostgreSQL communities**
