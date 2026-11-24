import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Set by `next upgrade --agent=security`: this app is kept on patched releases when advisories are published.
    agentUpgrade: "security",
  },
  // The dashboard is the landing page; the task list lives at /tasks.
  async redirects() {
    return [
      { source: "/", destination: "/dashboard", permanent: false },
      // Critical and Recurring are tabs on the task list now.
      { source: "/critical", destination: "/tasks?show=critical", permanent: false },
      { source: "/recurring", destination: "/tasks?show=recurring", permanent: false },
      // People and Teams moved into the HR section.
      { source: "/team", has: [{ type: "query", key: "show", value: "teams" }], destination: "/hr/teams", permanent: false },
      { source: "/team", destination: "/hr/people", permanent: false },
      { source: "/team/:id", destination: "/hr/teams/:id", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
