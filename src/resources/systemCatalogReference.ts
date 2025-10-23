/**
 * System catalog reference
 * Provides documentation about PostgreSQL system tables and views to help LLM generate correct queries
 */

export function getSystemCatalogReference(): string {
  return `# PostgreSQL System Catalog Reference

## Common Metadata Views

### pg_stat_user_tables
View with table-level statistics.

**Key columns:**
- schemaname (text) - Schema name
- relname (text) - Table name (NOT 'tablename'!)
- seq_scan (bigint) - Number of sequential scans
- seq_tup_read (bigint) - Tuples read by sequential scans
- idx_scan (bigint) - Number of index scans
- idx_tup_fetch (bigint) - Tuples fetched by index scans
- n_tup_ins (bigint) - Rows inserted
- n_tup_upd (bigint) - Rows updated
- n_tup_del (bigint) - Rows deleted
- n_live_tup (bigint) - Estimated live rows
- n_dead_tup (bigint) - Estimated dead rows
- last_vacuum (timestamp) - Last manual vacuum
- last_autovacuum (timestamp) - Last autovacuum
- last_analyze (timestamp) - Last manual analyze
- last_autoanalyze (timestamp) - Last autoanalyze

**Example:**
\`\`\`sql
SELECT schemaname, relname, n_live_tup, seq_scan, idx_scan
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_scan DESC;
\`\`\`

### pg_stat_user_indexes
View with index-level statistics.

**Key columns:**
- schemaname (text) - Schema name
- relname (text) - Table name (NOT 'tablename'!)
- indexrelname (text) - Index name
- idx_scan (bigint) - Number of index scans
- idx_tup_read (bigint) - Tuples read
- idx_tup_fetch (bigint) - Tuples fetched

**Example:**
\`\`\`sql
SELECT schemaname, relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
\`\`\`

### pg_indexes
View with index definitions.

**Key columns:**
- schemaname (text) - Schema name
- tablename (text) - Table name (here it IS 'tablename')
- indexname (text) - Index name
- indexdef (text) - Index definition (CREATE INDEX statement)

**Example:**
\`\`\`sql
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public';
\`\`\`

### pg_statio_user_tables
View with I/O statistics for tables.

**Key columns:**
- schemaname (text) - Schema name
- relname (text) - Table name (NOT 'tablename'!)
- heap_blks_read (bigint) - Disk blocks read
- heap_blks_hit (bigint) - Buffer hits
- idx_blks_read (bigint) - Index blocks read
- idx_blks_hit (bigint) - Index buffer hits

### information_schema.tables
ANSI SQL standard view.

**Key columns:**
- table_schema (text) - Schema name
- table_name (text) - Table name
- table_type (text) - 'BASE TABLE' or 'VIEW'

### information_schema.columns
ANSI SQL standard view.

**Key columns:**
- table_schema (text) - Schema name
- table_name (text) - Table name
- column_name (text) - Column name
- data_type (text) - Data type
- is_nullable (text) - 'YES' or 'NO'
- column_default (text) - Default value
- character_maximum_length (integer)
- numeric_precision (integer)
- numeric_scale (integer)

## Important Notes

### Column Naming Inconsistency ⚠️

PostgreSQL has inconsistent naming across views:

- **pg_stat_* views** use: **relname** (for table name)
- **pg_indexes view** uses: **tablename**
- **information_schema** uses: **table_name**

**Always use the correct column name for each view!**

### Case Sensitivity in PostgreSQL 🔤

**CRITICAL**: PostgreSQL handles identifiers (table/column names) with specific case rules:

1. **Unquoted identifiers are folded to lowercase**
   - \`SELECT * FROM MyTable\` → searches for \`mytable\`
   
2. **Quoted identifiers preserve exact case**
   - \`SELECT * FROM "MyTable"\` → searches for \`MyTable\` (exact match required)
   
3. **Tables created with quotes are case-sensitive**
   - If created as: \`CREATE TABLE "MyTable"\`
   - Must query as: \`SELECT * FROM "MyTable"\`
   - Cannot use: \`SELECT * FROM mytable\` (will fail!)

**Best Practice:**
- **ALWAYS use list_tables tool first** to see exact table names with correct casing
- Use the exact table name from list_tables in your queries
- When in doubt, use double quotes: \`SELECT * FROM "ExactTableName"\`

**Example:**
\`\`\`sql
-- From list_tables, you see: "__EFMigrationsHistory"

-- ❌ WRONG - PostgreSQL will look for lowercase
SELECT * FROM __efmigrationshistory;

-- ✅ CORRECT - Use exact case with quotes
SELECT * FROM "__EFMigrationsHistory";
\`\`\`

### Common Mistakes to Avoid

❌ \`SELECT tablename FROM pg_stat_user_tables\` - WRONG column name!
✅ \`SELECT relname FROM pg_stat_user_tables\` - CORRECT!

❌ \`SELECT relname FROM pg_indexes\` - WRONG column name!
✅ \`SELECT tablename FROM pg_indexes\` - CORRECT!

❌ \`SELECT * FROM __efmigrationshistory\` - WRONG case!
✅ \`SELECT * FROM "__EFMigrationsHistory"\` - CORRECT case!

### Join Example

When joining pg_indexes with pg_stat_user_indexes:

\`\`\`sql
SELECT 
  i.indexname,
  s.idx_scan
FROM pg_indexes i
LEFT JOIN pg_stat_user_indexes s 
  ON s.schemaname = i.schemaname 
  AND s.relname = i.tablename  ← Note: relname = tablename
  AND s.indexrelname = i.indexname;
\`\`\`

## Recommended Usage

1. Use **information_schema** for standard schema metadata (portable)
2. Use **pg_stat_*** views for performance statistics
3. Use **pg_catalog** for advanced PostgreSQL-specific metadata
4. Always check column names in the view before writing queries

## Full Documentation

For complete reference, see:
https://www.postgresql.org/docs/current/monitoring-stats.html
https://www.postgresql.org/docs/current/catalogs.html
`;
}

