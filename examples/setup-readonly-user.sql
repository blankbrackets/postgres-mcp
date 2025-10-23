-- Create a read-only database user for the MCP server
-- This follows the principle of least privilege for security

-- 1. Create the user
CREATE USER postgres_mcp_readonly WITH PASSWORD 'your_secure_password_here';

-- 2. Grant connection privilege
GRANT CONNECT ON DATABASE your_database TO postgres_mcp_readonly;

-- 3. Grant usage on schema (repeat for each schema you want to analyze)
GRANT USAGE ON SCHEMA public TO postgres_mcp_readonly;

-- 4. Grant SELECT on all existing tables in the schema
GRANT SELECT ON ALL TABLES IN SCHEMA public TO postgres_mcp_readonly;

-- 5. Grant SELECT on all future tables (optional but recommended)
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT ON TABLES TO postgres_mcp_readonly;

-- 6. Grant access to PostgreSQL statistics views (required for performance analysis)
GRANT pg_read_all_stats TO postgres_mcp_readonly;

-- 7. Grant access to sequences (for sequence health monitoring)
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres_mcp_readonly;

-- 8. Verify the user has correct permissions
\c your_database postgres_mcp_readonly
SELECT * FROM information_schema.tables WHERE table_schema = 'public' LIMIT 1;
SELECT * FROM pg_stat_user_tables LIMIT 1;

-- If the above queries work, the user is configured correctly!

