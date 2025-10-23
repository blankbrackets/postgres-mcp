# Troubleshooting Guide

## Viewing Logs

### Local Log File
```bash
# View entire log
cat logs/postgres-mcp-server.log

# Follow logs in real-time
tail -f logs/postgres-mcp-server.log

# View last 50 lines
tail -50 logs/postgres-mcp-server.log
```

### Claude Desktop Logs (macOS)
```bash
# View MCP server logs
tail -f ~/Library/Logs/Claude/mcp-server-postgres-analyzer.log

# View all MCP logs
tail -f ~/Library/Logs/Claude/mcp*.log
```

## Common Issues

### Connection Failed

**Error**: `Database connection test failed`

**Solutions**:
1. Check `DATABASE_URL` is set correctly in config
2. Use `127.0.0.1` instead of `localhost`
3. Verify database is running: `pg_isready -h 127.0.0.1 -p 5432`
4. Test connection directly: `psql "your_connection_string" -c "SELECT 1"`
5. Check firewall/network settings

### Permission Denied

**Error**: `permission denied for table/schema`

**Solutions**:
1. Grant SELECT privileges: See `examples/setup-readonly-user.sql`
2. Grant `pg_read_all_stats` role for statistics access
3. Verify user permissions: `\du` in psql

### Column/Table Not Found Errors

**Error**: `column "tablename" does not exist` or `relation not found`

**Solutions**:
1. Read the `postgres://system/catalog-reference` resource first
2. Use `list_tables` to see exact table names
3. Remember: `pg_stat_*` views use `relname`, not `tablename`
4. PostgreSQL is case-sensitive - use exact table names

### Server Not Appearing in Claude/Cursor

**Solutions**:
1. Verify absolute path to `build/index.js` is correct
2. Run `npm run build` to compile TypeScript
3. Restart Claude Desktop / Cursor after config changes
4. Check logs for startup errors

### Query Timeout

**Error**: `Query execution failed: timeout`

**Solutions**:
1. Increase `QUERY_TIMEOUT` environment variable (default: 30000ms)
2. Optimize the slow query
3. Check database performance

## Log Levels

Set `LOG_LEVEL` environment variable:
- `error` - Only errors
- `warn` - Warnings and errors
- `info` - General information (default)
- `debug` - Detailed debugging

## Debugging Workflow

1. **Check server is running**
   ```bash
   ps aux | grep postgres-mcp
   ```

2. **Check logs for errors**
   ```bash
   tail -50 logs/postgres-mcp-server.log | grep ERROR
   ```

3. **Enable debug logging**
   Add `"LOG_LEVEL": "debug"` to env config

4. **Test connection manually**
   ```bash
   psql "your_connection_string" -c "SELECT version()"
   ```

5. **Verify tools are registered**
   Look for "ListTools request received" in logs

