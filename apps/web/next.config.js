/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' membuat image Docker jauh lebih kecil -- lihat docker/web/Dockerfile
  output: 'standalone',
  reactStrictMode: true,

  // Jaring pengaman untuk `docker compose up` LOKAL (root docker-compose.yml)
  // yang TIDAK punya Apache di depannya seperti staging/production -- lihat
  // resolveApiBaseUrl() di lib/api-client.ts. Browser sekarang default ke
  // path relatif "/api/v1"; rule ini meneruskannya ke container `api` lewat
  // Next.js sendiri. Di staging/production, Apache SUDAH meng-intercept
  // /api/ SEBELUM permintaan sampai ke Next.js (lihat CICD-GUIDE.md
  // ProxyPass /api/), jadi rule ini tidak pernah tersentuh di sana.
  async rewrites() {
    const internalApiOrigin = (process.env.INTERNAL_API_BASE_URL || 'http://localhost:8080/api/v1').replace(/\/api\/v1\/?$/, '');
    return [
      { source: '/api/:path*', destination: `${internalApiOrigin}/api/:path*` },
    ];
  },
};

module.exports = nextConfig;
