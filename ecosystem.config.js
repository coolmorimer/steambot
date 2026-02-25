// PM2 ecosystem config
// Использование:
//   pm2 start ecosystem.config.js --env production
//   pm2 save
//   pm2 startup

module.exports = {
  apps: [
    {
      name:        'steambot-server',
      script:      'server/app.js',
      cwd:         __dirname,
      instances:   1,
      exec_mode:   'fork',
      watch:       false,
      max_memory_restart: '512M',

      env: {
        NODE_ENV: 'development',
        PORT:     4000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT:     4000,
      },

      // Логи
      error_file: './logs/pm2-error.log',
      out_file:   './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:  true,

      // Рестарт при сбоях
      autorestart:     true,
      restart_delay:   3000,
      max_restarts:    10,
      min_uptime:      '5s',

      // Graceful shutdown
      kill_timeout:    5000,
      listen_timeout:  8000,
    },
  ],
};
