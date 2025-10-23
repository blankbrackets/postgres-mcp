#!/usr/bin/env node

/**
 * Postgres MCP Server
 * Provides read-only access to Postgres database metadata and analysis tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

import { closePool, testConnection } from './db.js';
import { getDatabaseMetadata } from './resources/databaseMetadata.js';
import { getSystemCatalogReference } from './resources/systemCatalogReference.js';
import { comprehensiveDatabaseAnalysis } from './tools/comprehensiveDatabaseAnalysis.js';
import { getDatabaseHealth } from './tools/getDatabaseHealth.js';
import { listTables } from './tools/listTables.js';
import { analyzeQueryPerformance } from './tools/analyzeQueryPerformance.js';
import { getTableInfo } from './tools/getTableInfo.js';
import { getQueryStatistics } from './tools/getQueryStatistics.js';
import { suggestIndexingStrategies } from './tools/suggestIndexingStrategies.js';
import { suggestSchemaOptimizations } from './tools/suggestSchemaOptimizations.js';
import { executeQueryTool } from './tools/executeQuery.js';
import logger from './logger.js';

// Load environment variables
dotenv.config();

// Server information
const SERVER_NAME = 'postgres-mcp-server';
const SERVER_VERSION = '1.0.0';

/**
 * Initialize and start the MCP server
 */
async function main() {
  logger.info(`Starting ${SERVER_NAME} v${SERVER_VERSION}`);
  logger.info(`Node version: ${process.version}`);
  logger.info(`Platform: ${process.platform} ${process.arch}`);
  
  // Validate environment variables
  if (!process.env.DATABASE_URL) {
    logger.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Log connection info (without password)
  const dbUrlCensored = process.env.DATABASE_URL.replace(/:([^@]+)@/, ':****@');
  logger.info(`Database URL: ${dbUrlCensored}`);

  // Test database connection
  try {
    logger.info('Testing database connection...');
    await testConnection();
    logger.info('✓ Database connection established successfully');
  } catch (error) {
    logger.error('✗ Database connection failed:', error);
    process.exit(1);
  }

  // Create MCP server instance
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Register resource handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    logger.info('ListResources request received');
    return {
      resources: [
        {
          uri: 'postgres://database/metadata',
          name: 'Database Metadata',
          description: 'Complete database schema including all schemas, tables, columns, indexes, and constraints. Use this for a comprehensive view of the entire database structure, or use list_tables tool for a simpler table listing.',
          mimeType: 'application/json',
        },
        {
          uri: 'postgres://system/catalog-reference',
          name: 'PostgreSQL System Catalog Reference',
          description: 'IMPORTANT: Read this before using execute_query! Documents PostgreSQL system tables and views with correct column names. Critical for writing queries against pg_stat_*, pg_indexes, and information_schema views. Prevents common mistakes like using "tablename" instead of "relname".',
          mimeType: 'text/markdown',
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri.toString();
    logger.info(`ReadResource request for: ${uri}`);

    if (uri === 'postgres://database/metadata') {
      try {
        logger.info('Fetching database metadata...');
        const metadata = await getDatabaseMetadata();
        logger.info(`✓ Database metadata retrieved: ${metadata.schemas.length} schemas`);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(metadata, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('✗ Failed to fetch database metadata:', error);
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch database metadata: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (uri === 'postgres://system/catalog-reference') {
      logger.info('Fetching system catalog reference...');
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: getSystemCatalogReference(),
          },
        ],
      };
    }

    logger.warn(`✗ Unknown resource requested: ${uri}`);
    throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
  });

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.info('ListTools request received');
    return {
      tools: [
        {
          name: 'comprehensive_database_analysis',
          description: '🎯 START HERE FOR COMPLETE OPTIMIZATION! Performs systematic analysis of the ENTIRE database and returns a prioritized action plan with step-by-step workflow. This tool identifies ALL critical issues, creates a comprehensive analysis checklist, and tells you EXACTLY which other tools to use on which tables. Use this when asked to "optimize the database", "find all issues", or "do a complete analysis". This prevents missing important optimizations.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_database_health',
          description: '⭐ USE THIS SECOND for overall health check! Returns database-wide metrics: cache performance, bloat, unused indexes, replication, constraints, sequences. Use after comprehensive_database_analysis or when asked about "database health".',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'list_tables',
          description: '📋 REQUIRED BEFORE TABLE-SPECIFIC TOOLS! Lists all tables with schemas, types, row counts, and sizes. Always call this before get_table_info, get_query_statistics, or other table-specific tools to get exact table names and avoid errors.',
          inputSchema: {
            type: 'object',
            properties: {
              schema: {
                type: 'string',
                description: 'Optional: Filter tables by schema name (e.g., "public"). If omitted, returns tables from all schemas.',
              },
            },
          },
        },
        {
          name: 'analyze_query_performance',
          description: '🔥 CRITICAL FOR PERFORMANCE! Finds your slowest queries using pg_stat_statements or analyzes specific queries with EXPLAIN. Use this BEFORE analyzing individual tables to identify which queries are actually slow. Call with no parameters to get top 10 slowest queries, or provide a specific query to analyze.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Optional: Specific SELECT query to analyze with EXPLAIN. If omitted, returns slow queries from pg_stat_statements.',
              },
              topN: {
                type: 'number',
                description: 'Optional: Number of slow queries to return (default: 10). Only used when query is not provided.',
              },
            },
          },
        },
        {
          name: 'get_query_statistics',
          description: '📊 ESSENTIAL FOR TABLE ANALYSIS! Get detailed query/IO statistics for a table: sequential vs index scans, cache hit ratios, bloat percentage, index usage per index, last vacuum/analyze times. USE THIS for EVERY table you analyze - it provides the data needed to identify performance issues. This tool is often overlooked but is critical for finding optimization opportunities!',
          inputSchema: {
            type: 'object',
            properties: {
              schema: {
                type: 'string',
                description: 'Schema name',
              },
              table: {
                type: 'string',
                description: 'Table name',
              },
              limit: {
                type: 'number',
                description: 'Optional limit for result size',
              },
            },
            required: ['schema', 'table'],
          },
        },
        {
          name: 'suggest_indexing_strategies',
          description: '🎯 USE AFTER get_query_statistics! Analyzes indexing for a specific table: finds unused indexes, missing indexes on foreign keys, duplicate indexes. Always use get_query_statistics FIRST to get the scan statistics that inform indexing decisions.',
          inputSchema: {
            type: 'object',
            properties: {
              schema: {
                type: 'string',
                description: 'Schema name',
              },
              table: {
                type: 'string',
                description: 'Table name',
              },
              workloadSample: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Optional array of sample queries for workload analysis',
              },
            },
            required: ['schema', 'table'],
          },
        },
        {
          name: 'suggest_schema_optimizations',
          description: '🏗️ USE AFTER get_query_statistics! Analyzes schema design for a specific table: data type issues, foreign key problems, column statistics. Use get_query_statistics FIRST to understand table usage patterns.',
          inputSchema: {
            type: 'object',
            properties: {
              schema: {
                type: 'string',
                description: 'Schema name',
              },
              table: {
                type: 'string',
                description: 'Table name',
              },
            },
            required: ['schema', 'table'],
          },
        },
        {
          name: 'get_table_info',
          description: '📝 Table structure reference. Get table columns, data types, indexes, and constraints. Use this for understanding table structure, but use get_query_statistics for performance analysis.',
          inputSchema: {
            type: 'object',
            properties: {
              schema: {
                type: 'string',
                description: 'Schema name (e.g., "public")',
              },
              table: {
                type: 'string',
                description: 'Table name (from list_tables results)',
              },
            },
            required: ['schema', 'table'],
          },
        },
        {
          name: 'execute_query',
          description: '⚠️ LAST RESORT ONLY! Use this ONLY when the specialized tools above cannot provide the data you need. The other tools (get_query_statistics, suggest_indexing_strategies, etc.) are OPTIMIZED for database analysis and should be preferred. This executes arbitrary READ-ONLY SQL. The database connection enforces read-only mode (default_transaction_read_only=on). Before using this, ask yourself: "Is there a specialized tool that can do this?" IMPORTANT: Read "postgres://system/catalog-reference" resource FIRST to avoid column name errors (pg_stat_* views use "relname" not "tablename").',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'READ-ONLY SQL query. Allowed: SELECT, WITH (CTEs), EXPLAIN, SHOW, TABLE, VALUES. Use specialized tools instead when possible!',
              },
              maxRows: {
                type: 'number',
                description: 'Maximum rows to return (default: 100).',
              },
            },
            required: ['query'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info(`Tool called: ${name}`, { args });

    try {
      switch (name) {
        case 'comprehensive_database_analysis': {
          logger.debug(`Executing comprehensive_database_analysis`);
          const result = await comprehensiveDatabaseAnalysis();
          logger.info(`✓ comprehensive_database_analysis completed: ${result.critical_issues.length} critical issues, ${result.tables_requiring_attention.length} tables need attention`);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'list_tables': {
          const typedArgs = args as any;
          logger.debug(`Executing list_tables${typedArgs?.schema ? ` for schema ${typedArgs.schema}` : ''}`);
          const result = await listTables(typedArgs || {});
          logger.info(`✓ list_tables completed successfully: ${result.total_count} tables found`);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'get_table_info': {
          const typedArgs = args as any;
          logger.debug(`Executing get_table_info for ${typedArgs?.schema}.${typedArgs?.table}`);
          const result = await getTableInfo(typedArgs);
          logger.info(`✓ get_table_info completed successfully`);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'get_query_statistics': {
          const typedArgs = args as any;
          logger.debug(`Executing get_query_statistics for ${typedArgs?.schema}.${typedArgs?.table}`);
          const result = await getQueryStatistics(typedArgs);
          logger.info(`✓ get_query_statistics completed successfully`);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'suggest_schema_optimizations': {
          const typedArgs = args as any;
          logger.debug(`Executing suggest_schema_optimizations for ${typedArgs?.schema}.${typedArgs?.table}`);
          const result = await suggestSchemaOptimizations(typedArgs);
          logger.info(`✓ suggest_schema_optimizations completed successfully`);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'suggest_indexing_strategies': {
          const typedArgs = args as any;
          logger.debug(`Executing suggest_indexing_strategies for ${typedArgs?.schema}.${typedArgs?.table}`);
          const result = await suggestIndexingStrategies(typedArgs);
          logger.info(`✓ suggest_indexing_strategies completed successfully`);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'analyze_query_performance': {
          const typedArgs = args as any;
          logger.debug(`Executing analyze_query_performance${typedArgs?.query ? ' for specific query' : ` for top ${typedArgs?.topN || 10} slow queries`}`);
          const result = await analyzeQueryPerformance(typedArgs || {});
          logger.info(`✓ analyze_query_performance completed successfully`);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'get_database_health': {
          logger.debug(`Executing get_database_health`);
          const result = await getDatabaseHealth();
          logger.info(`✓ get_database_health completed successfully`);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'execute_query': {
          const typedArgs = args as any;
          logger.debug(`Executing execute_query: ${typedArgs?.query?.substring(0, 100)}...`);
          const result = await executeQueryTool(typedArgs);
          logger.info(`✓ execute_query completed successfully: ${result.rowCount} rows in ${result.executionTimeMs}ms`);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        default:
          logger.warn(`Unknown tool requested: ${name}`);
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error(`Tool execution failed for ${name}:`, error);
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Set up graceful shutdown
  const cleanup = async () => {
    logger.info('Shutting down server...');
    await closePool();
    logger.info('Server shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Start the server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
  logger.info('Server is ready to accept requests');
}

// Run the server
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});

