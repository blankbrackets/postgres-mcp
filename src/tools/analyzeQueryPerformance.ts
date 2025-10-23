/**
 * Tool: analyze_query_performance
 * Analyzes slow queries using pg_stat_statements (if available) or provides query execution plan
 */

import { executeQuery } from '../db.js';

export interface AnalyzeQueryPerformanceInput {
  query?: string;
  topN?: number;
}

export interface SlowQuery {
  query: string;
  calls: number;
  total_time_ms: number;
  mean_time_ms: number;
  max_time_ms: number;
  rows: number;
  shared_blks_hit: number;
  shared_blks_read: number;
  cache_hit_ratio: number;
}

export interface QueryPlan {
  query: string;
  plan: any;
  execution_time_ms?: number;
  planning_time_ms?: number;
}

export interface AnalyzeQueryPerformanceOutput {
  has_pg_stat_statements: boolean;
  slow_queries?: SlowQuery[];
  query_plan?: QueryPlan;
  recommendations: string[];
}

/**
 * Analyzes query performance using pg_stat_statements or EXPLAIN
 */
export async function analyzeQueryPerformance(input: AnalyzeQueryPerformanceInput): Promise<AnalyzeQueryPerformanceOutput> {
  const { query, topN = 10 } = input;

  // Check if pg_stat_statements extension exists
  const extensionCheck = await executeQuery<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
    ) as exists
  `);

  const has_pg_stat_statements = extensionCheck.rows[0]?.exists || false;
  const recommendations: string[] = [];

  let slow_queries: SlowQuery[] | undefined;
  let query_plan: QueryPlan | undefined;

  if (query) {
    // User provided a specific query to analyze - run EXPLAIN
    try {
      // Validate query is SELECT only (read-only)
      const trimmedQuery = query.trim().toLowerCase();
      if (!trimmedQuery.startsWith('select') && !trimmedQuery.startsWith('with')) {
        throw new Error('Only SELECT queries can be analyzed for security reasons');
      }

      const explainResult = await executeQuery<{ 'QUERY PLAN': any }>(`
        EXPLAIN (FORMAT JSON, ANALYZE false, VERBOSE false, BUFFERS false) ${query}
      `);

      query_plan = {
        query,
        plan: explainResult.rows,
      };

      // Analyze the plan for issues
      const planText = JSON.stringify(explainResult.rows);
      if (planText.includes('Seq Scan')) {
        recommendations.push('Query uses sequential scan - consider adding indexes on filter columns');
      }
      if (planText.includes('rows=')) {
        const rowsMatch = planText.match(/rows=(\d+)/);
        if (rowsMatch && parseInt(rowsMatch[1]) > 10000) {
          recommendations.push('Query returns many rows - consider adding LIMIT or more specific filters');
        }
      }
    } catch (error) {
      throw new Error(`Failed to analyze query: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (has_pg_stat_statements) {
    // Get slow queries from pg_stat_statements
    const slowQueriesResult = await executeQuery<{
      query: string;
      calls: string;
      total_exec_time: string;
      mean_exec_time: string;
      max_exec_time: string;
      rows: string;
      shared_blks_hit: string;
      shared_blks_read: string;
    }>(`
      SELECT 
        query,
        calls,
        total_exec_time,
        mean_exec_time,
        max_exec_time,
        rows,
        shared_blks_hit,
        shared_blks_read
      FROM pg_stat_statements
      WHERE query NOT LIKE '%pg_stat_statements%'
        AND query NOT LIKE '%information_schema%'
      ORDER BY total_exec_time DESC
      LIMIT $1
    `, [topN]);

    slow_queries = slowQueriesResult.rows.map(row => {
      const shared_blks_hit = parseFloat(row.shared_blks_hit);
      const shared_blks_read = parseFloat(row.shared_blks_read);
      const total_blks = shared_blks_hit + shared_blks_read;
      const cache_hit_ratio = total_blks > 0 ? (shared_blks_hit / total_blks) * 100 : 0;

      return {
        query: row.query,
        calls: parseInt(row.calls, 10),
        total_time_ms: parseFloat(row.total_exec_time),
        mean_time_ms: parseFloat(row.mean_exec_time),
        max_time_ms: parseFloat(row.max_exec_time),
        rows: parseInt(row.rows, 10),
        shared_blks_hit: parseInt(row.shared_blks_hit, 10),
        shared_blks_read: parseInt(row.shared_blks_read, 10),
        cache_hit_ratio: Math.round(cache_hit_ratio * 100) / 100,
      };
    });

    // Add recommendations based on slow queries
    if (slow_queries.length > 0) {
      const avgCacheHit = slow_queries.reduce((sum, q) => sum + q.cache_hit_ratio, 0) / slow_queries.length;
      if (avgCacheHit < 90) {
        recommendations.push(`Low cache hit ratio (${avgCacheHit.toFixed(1)}%) - consider increasing shared_buffers or adding indexes`);
      }

      const slowQueriesCount = slow_queries.filter(q => q.mean_time_ms > 100).length;
      if (slowQueriesCount > 0) {
        recommendations.push(`${slowQueriesCount} queries have mean execution time > 100ms - investigate and optimize`);
      }
    }
  } else {
    recommendations.push('Install pg_stat_statements extension for detailed query performance analysis: CREATE EXTENSION pg_stat_statements;');
  }

  return {
    has_pg_stat_statements,
    slow_queries,
    query_plan,
    recommendations,
  };
}

