# PostgreSQL System Catalog Reference

## Common Metadata Views

### pg_stat_user_tables
Table-level statistics.

**Important**: Use `relname` for table name, NOT `tablename`!

**Key columns:**
- `schemaname` (text) - Schema name
- `relname` (text) - Table name
- `seq_scan` (bigint) - Sequential scans
- `idx_scan` (bigint) - Index scans
- `n_live_tup` (bigint) - Live rows
- `n_dead_tup` (bigint) - Dead rows
- `last_vacuum`, `last_autovacuum` (timestamp)
- `last_analyze`, `last_autoanalyze` (timestamp)

### pg_stat_user_indexes
Index-level statistics.

**Important**: Use `relname` for table name, NOT `tablename`!

**Key columns:**
- `schemaname` (text) - Schema name
- `relname` (text) - Table name
- `indexrelname` (text) - Index name
- `idx_scan` (bigint) - Index scans
- `idx_tup_read`, `idx_tup_fetch` (bigint)

### pg_indexes
Index definitions.

**Important**: This view uses `tablename`, not `relname`!

**Key columns:**
- `schemaname` (text) - Schema name
- `tablename` (text) - Table name
- `indexname` (text) - Index name
- `indexdef` (text) - CREATE INDEX statement

### information_schema.tables
ANSI SQL standard view.

**Key columns:**
- `table_schema` (text) - Schema name
- `table_name` (text) - Table name
- `table_type` (text) - 'BASE TABLE' or 'VIEW'

## Column Naming - Critical Differences

| View | Schema Column | Table Column |
|------|---------------|--------------|
| pg_stat_user_tables | schemaname | **relname** |
| pg_stat_user_indexes | schemaname | **relname** |
| pg_indexes | schemaname | **tablename** |
| information_schema.tables | table_schema | **table_name** |

## PostgreSQL Case Sensitivity

**Rules:**
1. Unquoted identifiers → converted to lowercase
2. Quoted identifiers → case-sensitive (exact match required)
3. Tables created with quotes → must query with quotes

**Examples:**
```sql
-- ❌ WRONG
SELECT * FROM MyTable;  -- Looks for "mytable"

-- ✅ CORRECT
SELECT * FROM "MyTable";  -- Looks for "MyTable" exactly
```

## Common JOIN Pattern

```sql
-- Joining pg_indexes with pg_stat_user_indexes
SELECT 
  i.indexname,
  s.idx_scan
FROM pg_indexes i
LEFT JOIN pg_stat_user_indexes s 
  ON s.schemaname = i.schemaname 
  AND s.relname = i.tablename  -- Note: relname = tablename
  AND s.indexrelname = i.indexname
WHERE i.schemaname = 'public';
```

## Best Practices

1. **Use list_tables** to get exact table names
2. **Use double quotes** for mixed-case tables
3. **Check column names** in appropriate system catalog
4. **Use parameterized queries** for safety

## Further Reading

- [PostgreSQL Statistics Collector](https://www.postgresql.org/docs/current/monitoring-stats.html)
- [PostgreSQL System Catalogs](https://www.postgresql.org/docs/current/catalogs.html)

