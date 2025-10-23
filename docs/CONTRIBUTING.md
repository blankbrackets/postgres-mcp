# Contributing to Postgres MCP Server

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/postgres-mcp.git
cd postgres-mcp

# Install dependencies
npm install

# Run in development mode (auto-reload)
npm run dev

# Build for production
npm run build
```

## Project Structure

```
src/
├── index.ts        # Main MCP server
├── db.ts           # Database utilities
├── logger.ts       # Logging configuration
├── tools/          # Tool implementations
└── resources/      # Resource implementations
```

## Adding a New Tool

1. Create `src/tools/yourTool.ts`:
```typescript
import { executeQuery, validateIdentifier } from '../db.js';

export interface YourToolInput {
  schema: string;
  table: string;
}

export interface YourToolOutput {
  // Define your output structure
}

export async function yourTool(input: YourToolInput): Promise<YourToolOutput> {
  const { schema, table } = input;
  
  if (!validateIdentifier(schema) || !validateIdentifier(table)) {
    throw new Error('Invalid schema or table name');
  }
  
  const result = await executeQuery('SELECT ...', [schema, table]);
  
  return {
    // Transform and return data
  };
}
```

2. Import in `src/index.ts`
3. Add to tools array in `ListToolsRequestSchema` handler
4. Add case in `CallToolRequestSchema` handler
5. Update README.md with tool documentation

## Code Style

- Use TypeScript strict mode
- Use async/await (no callbacks)
- Use descriptive variable names
- Add JSDoc comments for public functions
- Follow existing naming conventions
- Keep functions focused and testable

## Testing

```bash
# Build
npm run build

# Test manually with database
DATABASE_URL="postgresql://..." node build/index.js

# Check logs
tail -f logs/postgres-mcp-server.log
```

## Security Guidelines

- **Never expose write operations**
- Use parameterized queries exclusively
- Validate all input parameters
- Test with read-only database user
- Document security implications

## Commit Guidelines

- Use clear, descriptive commit messages
- Reference issues when applicable
- Keep commits focused on single changes
- Test before committing

## Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Update documentation
6. Submit pull request with description
7. Respond to review feedback

## Questions?

Open an issue or discussion on GitHub!

