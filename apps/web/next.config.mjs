import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') }); // shared repo-root .env
const backend = process.env.BACKEND_URL || 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Same-origin proxy: the browser only ever talks to :3000, so the session cookie is first-party and no CORS is needed.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/admin/queues', destination: `${backend}/admin/queues/` },
      { source: '/admin/queues/:path*', destination: `${backend}/admin/queues/:path*` },
    ];
  },
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
