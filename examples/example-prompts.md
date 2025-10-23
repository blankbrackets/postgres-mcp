# Example Prompts for Claude/Cursor

Use these prompts with Claude or Cursor after configuring the Postgres MCP Server.

## 🎯 Comprehensive Analysis

### Best Starting Point
```
Do a comprehensive analysis and optimization of my database
```

This triggers the `comprehensive_database_analysis` tool which scans your entire database and creates a complete action plan.

### Alternative Comprehensive Prompts
```
Find ALL performance issues in my database and create an action plan

Analyze my entire database and tell me what needs optimization

Give me a complete database health report with recommendations
```

---

## 🏥 Health Checks

### Overall Health
```
What's the health of my database?

Check my database for performance issues

Are there any problems with my database?
```

### Specific Health Aspects
```
Is my database replication healthy?

Do I have any invalid constraints?

Which sequences are near their maximum value?

What's my cache hit ratio?
```

---

## 🐌 Query Performance

### Find Slow Queries
```
What are my slowest queries?

Show me the top 20 queries by execution time

Which queries are consuming the most resources?
```

### Analyze Specific Query
```
Analyze this query: SELECT * FROM users WHERE email LIKE '%@example.com'

Why is this query slow: SELECT * FROM orders WHERE created_at > NOW() - INTERVAL '30 days'

Get the execution plan for: SELECT u.*, o.* FROM users u JOIN orders o ON u.id = o.user_id
```

---

## 📊 Table Discovery

### List Tables
```
What tables exist in my database?

Show me all tables in the public schema

List all tables with their sizes

Which tables are the largest?
```

---

## 🔍 Table-Specific Analysis

### General Table Analysis
```
Analyze the users table for optimization opportunities

What can be optimized in the orders table?

Give me a complete analysis of the products table
```

### Index Analysis
```
Which indexes are unused on the sync_jobs table?

What indexing improvements can be made to the exemption_requests table?

Are there any missing indexes on foreign keys?

Show me duplicate indexes
```

### Schema Analysis
```
What data type issues exist in the asp_net_users table?

Which foreign keys are missing indexes?

Show me tables with high bloat

Which tables need vacuuming?
```

### Statistics
```
Show me query statistics for the messages table

What's the cache hit ratio for the notifications table?

How many sequential scans vs index scans on the sync_jobs table?
```

---

## 💡 Optimization Recommendations

### General Optimization
```
How can I improve the performance of my database?

What are quick wins for optimization?

Give me a prioritized list of optimizations
```

### Specific Optimizations
```
How can I make the sync_jobs table faster?

What indexes should I add to improve performance?

Which indexes can I safely drop?

How can I reduce table bloat?
```

---

## 🔍 Custom Queries

### Data Exploration
```
Execute: SELECT COUNT(*) FROM asp_net_users WHERE created_at > NOW() - INTERVAL '7 days'

Run query: SELECT status, COUNT(*) FROM exemption_requests GROUP BY status

Show me: SELECT organization_id, COUNT(*) as request_count FROM exemption_requests GROUP BY organization_id ORDER BY request_count DESC LIMIT 10
```

### Configuration Check
```
What are my PostgreSQL configuration settings?

Show me the current shared_buffers setting

What's the value of max_connections?
```

---

## 📈 Monitoring & Trends

```
Which tables are growing the fastest?

Show me tables with the most write activity

Which tables have the most dead tuples?

What tables are being scanned most frequently?
```

---

## 🎓 Learning

### Understanding Your Schema
```
Explain the structure of my database

What relationships exist between tables?

Show me the foreign key relationships

What are the primary keys in my tables?
```

### PostgreSQL Internals
```
How does PostgreSQL's query planner work with my data?

What statistics does PostgreSQL have about my tables?

Show me the internal statistics for the users table
```

---

## ⚠️ Important Tips

1. **Start with comprehensive analysis** for best results
2. **Let the tool guide you** - it will tell you which other tools to use
3. **Be specific** with table names (use exact casing)
4. **Ask follow-up questions** based on recommendations
5. **Don't use execute_query** unless specialized tools can't do it

---

## 🎯 Workflow Example

### Complete Database Optimization Session

```
User: "Optimize my database for better performance"

Claude: [Calls comprehensive_database_analysis]
Returns: 15 tables need attention, here's the workflow...

User: "Proceed with the analysis"

Claude: [Follows the workflow]
- Calls get_database_health
- Calls analyze_query_performance  
- Calls get_query_statistics for each problematic table
- Calls suggest_indexing_strategies for each table
- Calls suggest_schema_optimizations for each table

User: "What are the top priorities?"

Claude: Based on the analysis:
1. Drop 12 unused indexes (immediate improvement)
2. Add indexes to 5 foreign key columns (critical for JOINs)
3. Vacuum 3 tables with high bloat
4. Consider changing data type on users.status column
...
```

This systematic approach ensures nothing is missed!

