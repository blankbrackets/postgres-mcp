#!/bin/bash
# Example script to run Postgres MCP Server in Docker

# Build the Docker image
docker build -t postgres-mcp-server:latest .

# Run the container
# Replace DATABASE_URL with your actual PostgreSQL connection string
docker run -i \
  -e DATABASE_URL="postgresql://readonly_user:password@host.docker.internal:5432/your_database" \
  -e LOG_LEVEL="info" \
  -v $(pwd)/logs:/app/logs \
  postgres-mcp-server:latest

# Note: The -i flag keeps stdin open for MCP stdio transport
# Logs will be written to ./logs/postgres-mcp-server.log

