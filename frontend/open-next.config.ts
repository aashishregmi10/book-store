import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";
const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "cloudflare",
      converter: "edge",
      incrementalCache: "cloudflare-kv",
      tagCache: "cloudflare-do",
      queue: "cloudflare-queue",
    },
  },
};
export default config;