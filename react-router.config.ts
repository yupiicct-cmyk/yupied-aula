import type { Config } from "@react-router/dev/config";

// React Router v8: SSR en Cloudflare Workers. La Vite Environment API y el
// middleware vienen activados por defecto en v8.
export default {
  ssr: true,
} satisfies Config;
