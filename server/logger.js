'use strict';

/**
 * server/logger.js — Winston logger для сервера.
 */

const winston  = require('winston');
const path     = require('path');
const fs       = require('fs');

const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = winston.format;

const fmt = printf(({ level, message, timestamp: ts, stack }) =>
  `${ts} [${level.toUpperCase()}] ${stack || message}`
);

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    fmt
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), fmt),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'server.log'),
      maxsize:  50 * 1024 * 1024, // 50 MB
      maxFiles: 14,
      tailable: true,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level:    'error',
      maxsize:  20 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});

module.exports = logger;
