import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The dashboard is the landing page; the task list lives at /tasks.
  async redirects() {
    return [
      { source: "/", destination: "/dashboard", permanent: false },
      // Critical and Recurring are tabs on the task list now.
      { source: "/critical", destination: "/tasks?show=critical", permanent: false },
      { source: "/recurring", destination: "/tasks?show=recurring", permanent: false },
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
