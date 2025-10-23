# Architecture

## Overview

The Postgres MCP Server is built using the official Model Context Protocol SDK for TypeScript. It provides read-only access to PostgreSQL databases for AI-assisted analysis and optimization.

## Components

### 1. MCP Server (`src/index.ts`)

**Responsibilities:**
- Initialize MCP server with stdio transport
- Register tools and resources
- Handle requests (ListTools, CallTool, ListResources, ReadResource)
- Error handling and logging
- Graceful shutdown

**Key Design Decisions:**
- Stdio transport (standard for MCP, works with Claude Desktop and Cursor)
- Centralized error handling with helpful messages
- Tool ordering optimized for LLM discovery
- Comprehensive logging at all stages

### 2. Database Layer (`src/db.ts`)

**Responsibilities:**
- Create and manage PostgreSQL connection pool
- Enforce read-only mode at connection level
- Provide query execution wrapper
- Input validation
- Connection lifecycle management

**Security Features:**
- Adds `default_transaction_read_only=on` to connection string
- Validates identifiers to prevent SQL injection (defense-in-depth)
- Uses parameterized queries exclusively
- Sets query timeout to prevent long-running queries

### 3. Logger (`src/logger.ts`)

**Responsibilities:**
- File-based logging with rotation
- Stderr logging (captured by Claude Desktop)
- Multiple log levels
- Structured log formatting

**Configuration:**
- Log file: `logs/postgres-mcp-server.log`
- Rotation: 10MB per file, 5 files max
- Levels: error, warn, info, debug

### 4. Tools (8 files in `src/tools/`)

Each tool is a self-contained module with:
- Input/output TypeScript interfaces
- Main function that queries PostgreSQL
- Error handling
- Data transformation/analysis

**Tool Categories:**
- **Discovery**: `listTables`, `comprehensive_database_analysis`
- **Health**: `getDatabaseHealth`, `getQueryStatistics`
- **Analysis**: `getTableInfo`, `analyzeQueryPerformance`
- **Optimization**: `suggestIndexingStrategies`, `suggestSchemaOptimizations`
- **Utility**: `executeQuery`

### 5. Resources (2 files in `src/resources/`)

**database_metadata**:
- Returns complete schema structure
- Nested JSON: schemas → tables → columns/indexes/constraints

**system_catalog_reference**:
- Markdown documentation
- PostgreSQL system catalog reference
- Prevents common query errors

## Data Flow

```
Claude/Cursor
    ↓ (stdio)
MCP Server (index.ts)
    ↓
Tool Handler
    ↓
Database Layer (db.ts)
    ↓ (parameterized query)
PostgreSQL Database
    ↓ (result set)
Tool Handler
    ↓ (JSON response)
MCP Server
    ↓ (stdio)
Claude/Cursor
```

## Error Handling Strategy

### Layered Approach

1. **Connection Level**: PostgreSQL rejects writes
2. **Validation Level**: Pre-execution checks
3. **Execution Level**: Try-catch with helpful errors
4. **MCP Level**: Proper error codes (ErrorCode.InternalError, etc.)
5. **LLM Level**: Error messages that teach

### Error Message Design

All errors include:
- What went wrong
- Why it happened
- How to fix it
- Which resource/tool to use

Example:
```
Column error: PostgreSQL system views use different column names. 
In pg_stat_user_tables, use "relname" instead of "tablename". 
Read the "postgres://system/catalog-reference" resource for correct column names.
```

## Security Model

### Defense in Depth

**Layer 1: Network**
- Database accessible only to authorized hosts
- SSL/TLS recommended for production

**Layer 2: PostgreSQL User**
- Read-only user with SELECT-only privileges
- `pg_read_all_stats` for statistics access

**Layer 3: Connection String**
- `default_transaction_read_only=on` parameter
- Cannot be bypassed by application

**Layer 4: Application Validation**
- SQL keyword blocking
- Query type validation
- Identifier validation

**Layer 5: Code Design**
- Parameterized queries only
- No write operations exposed
- Input sanitization

## Performance Considerations

### Connection Pooling
- Max connections: 10
- Idle timeout: 30s
- Connection timeout: 10s
- Statement timeout: configurable (default: 30s)

### Query Optimization
- Most queries use indexed system catalogs
- Parameterized queries cached by PostgreSQL
- Minimal overhead for tool calls

### Caching Strategy
- No application-level caching (always fresh data)
- Relies on PostgreSQL's internal caching
- Short-lived connection pool

## TypeScript Design

### Type Safety
- Strict mode enabled
- All functions fully typed
- Interface-based contracts
- Generic query execution with type parameters

### Module Organization
- Clear separation of concerns
- Each tool in separate file
- Shared utilities in `db.ts`
- Resource isolation

### Build Output
- Compiled JavaScript in `build/`
- Source maps for debugging
- Type declaration files (.d.ts)
- ES modules (ESM)

## Extensibility

### Adding New Tools

1. Create new file in `src/tools/`
2. Define input/output interfaces
3. Implement main function
4. Import in `src/index.ts`
5. Register in `ListToolsRequestSchema` handler
6. Add case in `CallToolRequestSchema` handler
7. Update documentation

### Adding New Resources

1. Create new file in `src/resources/`
2. Implement getter function
3. Import in `src/index.ts`
4. Register in `ListResourcesRequestSchema` handler
5. Add case in `ReadResourceRequestSchema` handler
6. Update documentation

## Dependencies

### Production
- `@modelcontextprotocol/sdk` - Official MCP SDK
- `pg` - PostgreSQL client
- `dotenv` - Environment variables
- `winston` - Logging

### Development
- `typescript` - TypeScript compiler
- `@types/node`, `@types/pg` - Type definitions
- `tsx` - Development execution

All dependencies are well-maintained and widely used in the Node.js ecosystem.

