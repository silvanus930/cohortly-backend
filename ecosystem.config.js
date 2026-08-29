/**
 * PM2 process definition for running the compiled API on a VM.
 *
 *   npm ci && npm run build
 *   pm2 start ecosystem.config.js --env production
 */
module.exports = {
  apps: [
    {
      name: 'cohortly-api',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: process.env.PM2_INSTANCES || 'max',
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '512M',
      kill_timeout: 10000,
      wait_ready: false,
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
