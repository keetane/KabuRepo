import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: isGitHubPages ? '/KabuRepo' : '',
  assetPrefix: isGitHubPages ? '/KabuRepo/' : undefined,
  trailingSlash: true,
};

export default nextConfig;
