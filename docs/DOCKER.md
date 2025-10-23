# Docker Deployment

This guide covers running the Postgres MCP Server in Docker.

## Quick Start with Docker

### Build the Image

```bash
docker build -t postgres-mcp-server:latest .
```

### Run the Container

```bash
docker run -i \
  -e DATABASE_URL="postgresql://readonly_user:password@host.docker.internal:5432/your_db" \
  -v $(pwd)/logs:/app/logs \
  postgres-mcp-server:latest
```

**Important**: The `-i` flag keeps stdin open, which is required for MCP stdio transport.

## Using with Docker Compose

See [`examples/docker-compose.yml`](../examples/docker-compose.yml).

```bash
# Start services
docker-compose -f examples/docker-compose.yml up

# Run in background
docker-compose -f examples/docker-compose.yml up -d

# View logs
docker-compose -f examples/docker-compose.yml logs -f postgres-mcp

# Stop services
docker-compose -f examples/docker-compose.yml down
```

## Integration with Claude Desktop (Docker)

Update your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "postgres-analyzer": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "DATABASE_URL=postgresql://readonly_user:password@host.docker.internal:5432/your_db",
        "postgres-mcp-server:latest"
      ]
    }
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `LOG_LEVEL` | No | `info` | Logging level (error, warn, info, debug) |
| `QUERY_TIMEOUT` | No | `30000` | Query timeout in milliseconds |

## Volumes

Mount the logs directory to persist logs:

```bash
-v $(pwd)/logs:/app/logs
```

## Networking

### Connecting to Host Database

**macOS/Windows Docker Desktop:**
Use `host.docker.internal` to connect to databases on your host machine:

```
postgresql://user:pass@host.docker.internal:5432/database
```

**Linux:**
Use `--network host` or the host's IP address:

```bash
docker run -i --network host \
  -e DATABASE_URL="postgresql://user:pass@localhost:5432/database" \
  postgres-mcp-server:latest
```

### Connecting to Another Container

Use Docker networks:

```yaml
# docker-compose.yml
services:
  postgres-mcp:
    environment:
      DATABASE_URL: postgresql://user:pass@postgres:5432/database
    networks:
      - mcp-network
  
  postgres:
    networks:
      - mcp-network

networks:
  mcp-network:
```

## Building for Multiple Architectures

```bash
# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t postgres-mcp-server:latest \
  .
```

## Publishing to Container Registry

### Docker Hub

```bash
# Tag the image
docker tag postgres-mcp-server:latest your-username/postgres-mcp-server:1.0.0
docker tag postgres-mcp-server:latest your-username/postgres-mcp-server:latest

# Push to Docker Hub
docker push your-username/postgres-mcp-server:1.0.0
docker push your-username/postgres-mcp-server:latest
```

### GitHub Container Registry

```bash
# Login
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Tag the image
docker tag postgres-mcp-server:latest ghcr.io/blankbrackets/postgres-mcp-server:1.0.0
docker tag postgres-mcp-server:latest ghcr.io/blankbrackets/postgres-mcp-server:latest

# Push
docker push ghcr.io/blankbrackets/postgres-mcp-server:1.0.0
docker push ghcr.io/blankbrackets/postgres-mcp-server:latest
```

## Security Considerations

### Running as Non-Root

The Dockerfile uses `USER node` to run as a non-root user.

### Read-Only Filesystem

For extra security, run with read-only filesystem:

```bash
docker run -i --read-only \
  -v $(pwd)/logs:/app/logs \
  -e DATABASE_URL="..." \
  postgres-mcp-server:latest
```

### Secrets Management

**Don't pass database credentials via command line!** Use:

1. **Environment file:**
```bash
docker run -i --env-file .env postgres-mcp-server:latest
```

2. **Docker secrets** (Swarm):
```bash
echo "postgresql://..." | docker secret create db_url -
docker service create --secret db_url ...
```

3. **Kubernetes secrets:**
```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: postgres-credentials
        key: connection-string
```

## Troubleshooting

### Container Exits Immediately

MCP servers need to keep stdin open. Ensure you use `-i` flag:

```bash
docker run -i postgres-mcp-server:latest
```

### Cannot Connect to Database

**From container to host database:**
- macOS/Windows: Use `host.docker.internal`
- Linux: Use `--network host` or host IP

**Test connectivity:**
```bash
docker run -i postgres-mcp-server:latest \
  sh -c "apk add postgresql-client && psql $DATABASE_URL -c 'SELECT 1'"
```

### Logs Not Appearing

Check volume mount:
```bash
docker run -i \
  -v $(pwd)/logs:/app/logs \
  postgres-mcp-server:latest
```

Verify permissions on host logs directory.

## Example: Complete Setup

```bash
# 1. Build image
docker build -t postgres-mcp-server:latest .

# 2. Create logs directory
mkdir -p logs

# 3. Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://readonly_user:password@host.docker.internal:5432/your_db
LOG_LEVEL=debug
EOF

# 4. Run container
docker run -i \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  postgres-mcp-server:latest

# 5. View logs (in another terminal)
tail -f logs/postgres-mcp-server.log
```

## Performance

The Docker image is optimized:
- **Size**: ~150MB (Alpine-based)
- **Startup**: < 2 seconds
- **Runtime**: Same performance as native Node.js

## CI/CD Integration

See `.github/workflows/` for GitHub Actions examples (if added).

