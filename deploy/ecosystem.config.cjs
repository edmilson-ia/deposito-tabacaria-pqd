// PM2 serve os arquivos estáticos de dist/ numa porta própria (SPA: qualquer rota cai no index.html).
// Uso (na pasta do projeto, depois de `npm run build`):  pm2 start deploy/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'pqd-catalogo',
      script: 'serve',
      env: {
        PM2_SERVE_PATH: './dist',
        PM2_SERVE_PORT: '3010', // troque se a porta já estiver em uso na VPS
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html',
      },
    },
  ],
}
