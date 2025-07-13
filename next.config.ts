/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
  async rewrites() {
    return [
      {
        source: '/api/drive/:path*',
        destination: 'http://localhost:8000/api/drive/:path*', // proxy to backend
      },
    ];
  },
};

module.exports = nextConfig;
