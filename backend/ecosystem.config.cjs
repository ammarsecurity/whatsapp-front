/** Optional PM2 file — use only if aaPanel Node project is already PM2-based. Do not replace aaPanel process manager. */
module.exports = {
  apps: [
    {
      name: 'whatsapp-api',
      cwd: '/www/wwwroot/whatsapp-alufiq',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1800M',
      env: {
        NODE_ENV: 'production',
        PORT: 8489,
      },
    },
  ],
};
