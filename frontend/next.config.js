/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['lucide-react'],
  images: {
    domains: ['localhost', 'chronizer.onrender.com'],
  },
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://chronizer.onrender.com/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
