/**
 * Logger module for MCP server
 * Logs to both file and stderr (for Claude Desktop compatibility)
 */

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log file path
const logFilePath = path.join(logDir, 'postgres-mcp-server.log');

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      if (stack) {
        return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
      }
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    // File transport - logs everything to file
    new winston.transports.File({ 
      filename: logFilePath,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
    // Console transport to stderr - Claude Desktop captures this
    new winston.transports.Console({
      stderrLevels: ['error', 'warn', 'info', 'debug'],
    }),
  ],
});

// Log the file location on startup
logger.info(`Logging to file: ${logFilePath}`);

export default logger;

