declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    SCALE_DEVICE_TOKEN?: string;
    BUCKET?: R2Bucket;
  }
}
