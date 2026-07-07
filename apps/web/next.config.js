/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' membuat image Docker jauh lebih kecil -- lihat docker/web/Dockerfile
  output: 'standalone',
  reactStrictMode: true,
};

module.exports = nextConfig;
