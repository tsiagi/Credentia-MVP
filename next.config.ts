import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Pin the app root here. A parent-folder package-lock.json at ~/tyrel/
// otherwise makes Turbopack treat credentia/ as a sub-package and breaks
// the React Client Manifest (global-error module not found).
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
