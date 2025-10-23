/**
 * Tool: comprehensive_database_analysis
 * Performs a complete systematic analysis of the entire database and returns a prioritized action plan
 * 
 * This tool guides the LLM to use other tools systematically for thorough analysis
 */

import { executeQuery } from '../db.js';

export interface ComprehensiveDatabaseAnalysisOutput {
  summary: {
    total_tables: number;
    total_size: string;
    overall_health_score: number; // 0-100
    critical_issues: number;
    warnings: number;
  };
  critical_issues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    issue: string;
    affected_objects: string[];
    recommended_tool: string;
    recommended_action: string;
  }>;
  analysis_workflow: {
    step: number;
    description: string;
    tool_to_use: string;
    parameters?: any;
    rationale: string;
  }[];
  tables_requiring_attention: Array<{
    schema: string;
    table: string;
    reasons: string[];
    priority: 'critical' | 'high' | 'medium' | 'low';
    suggested_tools: string[];
  }>;
  quick_wins: string[];
  long_term_improvements: string[];
}

/**
 * Performs comprehensive database analysis and creates an action plan
 */
export async function comprehensiveDatabaseAnalysis(): Promise<ComprehensiveDatabaseAnalysisOutput> {
  const critical_issues: ComprehensiveDatabaseAnalysisOutput['critical_issues'] = [];
  const tables_requiring_attention: ComprehensiveDatabaseAnalysisOutput['tables_requiring_attention'] = [];
  const quick_wins: string[] = [];
  const long_term_improvements: string[] = [];

  // Get database size
  const sizeResult = await executeQuery<{
    total_size: string;
    total_tables: string;
  }>(`
    SELECT 
      pg_size_pretty(pg_database_size(current_database())) as total_size,
      (SELECT COUNT(*) FROM information_schema.tables 
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema')) as total_tables
  `);

  const total_tables = parseInt(sizeResult.rows[0].total_tables, 10);
  const total_size = sizeResult.rows[0].total_size;

  // Issue 1: Check for unused indexes
  const unusedIndexesResult = await executeQuery<{
    count: string;
    total_size: string;
  }>(`
    SELECT 
      COUNT(*) as count,
      pg_size_pretty(SUM(pg_relation_size(indexrelid))) as total_size
    FROM pg_stat_user_indexes
    WHERE idx_scan = 0
  `);

  const unusedIndexCount = parseInt(unusedIndexesResult.rows[0].count, 10);
  if (unusedIndexCount > 0) {
    critical_issues.push({
      severity: 'high',
      category: 'Performance',
      issue: `${unusedIndexCount} unused indexes wasting ${unusedIndexesResult.rows[0].total_size}`,
      affected_objects: ['Multiple tables'],
      recommended_tool: 'suggest_indexing_strategies',
      recommended_action: 'Analyze each table with suggest_indexing_strategies, then drop unused indexes',
    });
    quick_wins.push(`Drop ${unusedIndexCount} unused indexes to save ${unusedIndexesResult.rows[0].total_size} and improve write performance`);
  }

  // Issue 2: Check for tables with high sequential scans
  const highSeqScanResult = await executeQuery<{
    schemaname: string;
    relname: string;
    seq_scan: string;
    idx_scan: string;
    n_live_tup: string;
  }>(`
    SELECT 
      schemaname,
      relname,
      seq_scan,
      idx_scan,
      n_live_tup
    FROM pg_stat_user_tables
    WHERE seq_scan > 100
      AND (idx_scan = 0 OR seq_scan > idx_scan * 2)
      AND n_live_tup > 1000
    ORDER BY seq_scan DESC
  `);

  if (highSeqScanResult.rows.length > 0) {
    const tableList = highSeqScanResult.rows.map(r => `${r.schemaname}.${r.relname}`);
    critical_issues.push({
      severity: 'critical',
      category: 'Performance',
      issue: `${highSeqScanResult.rows.length} tables have excessive sequential scans`,
      affected_objects: tableList,
      recommended_tool: 'suggest_indexing_strategies',
      recommended_action: 'Add indexes to reduce sequential scans',
    });

    for (const row of highSeqScanResult.rows) {
      tables_requiring_attention.push({
        schema: row.schemaname,
        table: row.relname,
        reasons: [`High sequential scans: ${row.seq_scan}, index scans: ${row.idx_scan}`],
        priority: 'critical',
        suggested_tools: ['get_query_statistics', 'suggest_indexing_strategies'],
      });
    }
  }

  // Issue 3: Check for unindexed foreign keys
  const unindexedFKResult = await executeQuery<{
    count: string;
  }>(`
    SELECT COUNT(*) as count
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.constraint_schema = kcu.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index idx
        JOIN pg_class c ON c.oid = idx.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = idx.indkey[0]
        WHERE n.nspname = tc.table_schema
          AND c.relname = tc.table_name
          AND a.attname = kcu.column_name
      )
  `);

  const unindexedFKCount = parseInt(unindexedFKResult.rows[0].count, 10);
  if (unindexedFKCount > 0) {
    critical_issues.push({
      severity: 'critical',
      category: 'Performance',
      issue: `${unindexedFKCount} foreign keys without indexes (causes slow JOINs)`,
      affected_objects: ['Multiple tables'],
      recommended_tool: 'suggest_indexing_strategies',
      recommended_action: 'Create indexes on all foreign key columns for better JOIN performance',
    });
    quick_wins.push(`Add indexes to ${unindexedFKCount} foreign key columns for immediate JOIN performance improvement`);
  }

  // Issue 4: Check for bloated tables
  const bloatedTablesResult = await executeQuery<{
    schemaname: string;
    relname: string;
    n_dead_tup: string;
    bloat_pct: string;
  }>(`
    SELECT 
      schemaname,
      relname,
      n_dead_tup,
      ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as bloat_pct
    FROM pg_stat_user_tables
    WHERE n_dead_tup::float / NULLIF(n_live_tup + n_dead_tup, 0) > 0.1
      AND n_live_tup + n_dead_tup > 1000
    ORDER BY n_dead_tup DESC
  `);

  if (bloatedTablesResult.rows.length > 0) {
    const tableList = bloatedTablesResult.rows.map(r => `${r.schemaname}.${r.relname} (${r.bloat_pct}% bloat)`);
    critical_issues.push({
      severity: 'high',
      category: 'Maintenance',
      issue: `${bloatedTablesResult.rows.length} tables have >10% bloat`,
      affected_objects: tableList,
      recommended_tool: 'get_query_statistics',
      recommended_action: 'Run VACUUM on bloated tables during maintenance window',
    });

    for (const row of bloatedTablesResult.rows) {
      const existingTable = tables_requiring_attention.find(
        t => t.schema === row.schemaname && t.table === row.relname
      );
      if (existingTable) {
        existingTable.reasons.push(`High bloat: ${row.bloat_pct}%`);
        existingTable.suggested_tools.push('get_query_statistics');
      } else {
        tables_requiring_attention.push({
          schema: row.schemaname,
          table: row.relname,
          reasons: [`High bloat: ${row.bloat_pct}%`],
          priority: 'high',
          suggested_tools: ['get_query_statistics', 'suggest_schema_optimizations'],
        });
      }
    }
  }

  // Issue 5: Check for tables never analyzed
  const neverAnalyzedResult = await executeQuery<{
    schemaname: string;
    relname: string;
  }>(`
    SELECT schemaname, relname
    FROM pg_stat_user_tables
    WHERE last_analyze IS NULL 
      AND last_autoanalyze IS NULL
      AND n_live_tup > 100
  `);

  if (neverAnalyzedResult.rows.length > 0) {
    critical_issues.push({
      severity: 'high',
      category: 'Maintenance',
      issue: `${neverAnalyzedResult.rows.length} tables have never been analyzed (query planner lacks statistics)`,
      affected_objects: neverAnalyzedResult.rows.map(r => `${r.schemaname}.${r.relname}`),
      recommended_tool: 'get_query_statistics',
      recommended_action: 'Run ANALYZE on these tables immediately',
    });
  }

  // Calculate health score
  let health_score = 100;
  let criticalCount = 0;
  let warningCount = 0;

  for (const issue of critical_issues) {
    if (issue.severity === 'critical') {
      health_score -= 20;
      criticalCount++;
    } else if (issue.severity === 'high') {
      health_score -= 10;
      warningCount++;
    } else if (issue.severity === 'medium') {
      health_score -= 5;
      warningCount++;
    }
  }

  health_score = Math.max(0, health_score);

  // Create systematic analysis workflow
  const analysis_workflow: ComprehensiveDatabaseAnalysisOutput['analysis_workflow'] = [
    {
      step: 1,
      description: 'Get overall database health assessment',
      tool_to_use: 'get_database_health',
      rationale: 'Identifies system-wide issues: cache performance, replication, constraints, sequences',
    },
    {
      step: 2,
      description: 'Identify slow queries if pg_stat_statements is available',
      tool_to_use: 'analyze_query_performance',
      rationale: 'Find the most expensive queries that need optimization',
    },
  ];

  // Add per-table analysis for problematic tables
  const topTables = tables_requiring_attention.slice(0, 5);
  topTables.forEach((table, index) => {
    analysis_workflow.push({
      step: 3 + index * 3,
      description: `Analyze ${table.schema}.${table.table} - ${table.reasons.join(', ')}`,
      tool_to_use: 'get_query_statistics',
      parameters: { schema: table.schema, table: table.table },
      rationale: 'Get detailed I/O statistics, cache performance, and bloat metrics',
    });

    analysis_workflow.push({
      step: 4 + index * 3,
      description: `Get indexing analysis for ${table.schema}.${table.table}`,
      tool_to_use: 'suggest_indexing_strategies',
      parameters: { schema: table.schema, table: table.table },
      rationale: 'Identify missing, unused, or duplicate indexes',
    });

    analysis_workflow.push({
      step: 5 + index * 3,
      description: `Get schema optimization suggestions for ${table.schema}.${table.table}`,
      tool_to_use: 'suggest_schema_optimizations',
      parameters: { schema: table.schema, table: table.table },
      rationale: 'Analyze data types, foreign keys, and column statistics',
    });
  });

  // Add remaining tables if needed
  if (tables_requiring_attention.length > 5) {
    analysis_workflow.push({
      step: 1000,
      description: `Repeat steps for remaining ${tables_requiring_attention.length - 5} tables`,
      tool_to_use: 'Multiple tools',
      rationale: 'Ensure all problematic tables are analyzed',
    });
  }

  return {
    summary: {
      total_tables,
      total_size,
      overall_health_score: health_score,
      critical_issues: criticalCount,
      warnings: warningCount,
    },
    critical_issues,
    analysis_workflow,
    tables_requiring_attention,
    quick_wins,
    long_term_improvements,
  };
}

