import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable experimental features for better MCP server handling
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;

