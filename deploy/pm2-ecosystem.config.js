module.exports = {
  apps: [
    {
      name: 'ajedrez',
      script: './server.js',
      cwd: '/var/www/ajedrez',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // ALLOWED_ORIGINS: 'https://tu-dominio.example.com'
      }
    }
  ]
};
