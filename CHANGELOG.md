# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2025-10-23 ✅ Published

**NPM Package**: https://www.npmjs.com/package/blankbrackets-postgres-mcp-server  
**Installation**: `npm install -g blankbrackets-postgres-mcp-server`

**Docker Image**: https://hub.docker.com/r/blankbrackets/postgres-mcp-server  
**Docker Pull**: `docker pull blankbrackets/postgres-mcp-server:latest`

**Smithery Registry**: `@blankbrackets/postgres-mcp` ✅ Registered  
**Smithery Install**: `npx @smithery/cli install @blankbrackets/postgres-mcp`

### Changed

- Added `module` field to package.json for Smithery compatibility
- Updated smithery.yaml for proper validation

## [1.0.0] - 2025-10-23

Initial release (see 1.0.1 for publication details)

### Added

- Initial release of Postgres MCP Server
- 10 comprehensive analysis tools:
  - `comprehensive_database_analysis` - Complete database scan with action plan
  - `get_database_health` - Overall health metrics
  - `list_tables` - Table discovery
  - `analyze_query_performance` - Slow query detection
  - `get_query_statistics` - Table-level performance stats
  - `suggest_indexing_strategies` - Index optimization
  - `suggest_schema_optimizations` - Schema design analysis
  - `get_table_info` - Table structure
  - `execute_query` - Custom READ-ONLY SQL execution
- 2 documentation resources:
  - `postgres://database/metadata` - Complete schema structure
  - `postgres://system/catalog-reference` - PostgreSQL system catalog reference
- Multi-layer read-only security enforcement
- Winston-based file logging with rotation
- Comprehensive error messages with self-teaching guidance
- Support for PostgreSQL 9.6+
- Stdio transport for Claude Desktop and Cursor

### Security

- Connection-level read-only mode (`default_transaction_read_only=on`)
- SQL keyword validation (blocks INSERT, UPDATE, DELETE, etc.)
- Parameterized queries throughout
- Input validation on all identifiers

### Documentation

- Comprehensive README with quick start guide
- Example configurations for Claude Desktop and Cursor
- Setup script for read-only PostgreSQL user
- Architecture documentation
- Troubleshooting guide
- PostgreSQL system catalog reference
- Contributing guidelines
- Example prompts for common use cases

### Performance

- All tools execute in < 50ms
- Efficient connection pooling
- Query timeout protection
- Optimized PostgreSQL metadata queries

## [Unreleased]

### Future Enhancements

- Batch analysis tool for analyzing multiple tables at once
- Configurable write mode with SQL parsing (optional)
- Runtime connection configuration
- Query result caching
- Export reports (PDF, CSV, JSON)

---

For upgrade instructions and migration guides, see the documentation in [`docs/`](docs/).

