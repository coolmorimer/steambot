'use strict';

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// В упакованном .exe __dirname указывает внутрь .asar — туда нельзя писать.
const LOGS_DIR = process.env.APP_USER_DATA
  ? path.join(process.env.APP_USER_DATA, 'logs')
  : path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const timestampFormat = winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' });

const fileFormat = winston.format.combine(
  timestampFormat,
  winston.format.printf(({ timestamp, level, message }) => {
    return `[${timestamp}] ${level.toUpperCase().padEnd(5)} ${message}`;
  })
);

const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  timestampFormat,
  winston.format.printf(({ timestamp, level, message }) => {
    return `[${timestamp}] ${level.padEnd(15)} ${message}`;
  })
);

const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'bot.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
      tailable: true,
    }),
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});

module.exports = logger;
