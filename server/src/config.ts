import "dotenv/config";

export type ServerConfig = {
  port: number;
  clientOrigin: string;
  redisUrl?: string;
  redisToken?: string;
  roomTtlSeconds: number;
  s3Endpoint?: string;
  s3Region: string;
  s3Bucket?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  publicAssetBaseUrl: string;
  aiEndpoint?: string;
  aiApiKey?: string;
  aiTimeoutMs: number;
  fallbackImageUrl: string;
};

export function loadConfig(env = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 4000),
    clientOrigin: env.CLIENT_ORIGIN ?? "http://localhost:5173",
    redisUrl: env.UPSTASH_REDIS_REST_URL,
    redisToken: env.UPSTASH_REDIS_REST_TOKEN,
    roomTtlSeconds: Number(env.ROOM_TTL_SECONDS ?? 60 * 60 * 6),
    s3Endpoint: env.S3_ENDPOINT,
    s3Region: env.S3_REGION ?? "auto",
    s3Bucket: env.S3_BUCKET,
    s3AccessKeyId: env.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: env.S3_SECRET_ACCESS_KEY,
    publicAssetBaseUrl: env.PUBLIC_ASSET_BASE_URL ?? "http://localhost:4000/uploads",
    aiEndpoint: env.AI_ENDPOINT,
    aiApiKey: env.AI_API_KEY,
    aiTimeoutMs: Number(env.AI_TIMEOUT_MS ?? 15000),
    fallbackImageUrl: env.FALLBACK_IMAGE_URL ?? "http://localhost:4000/fallback-cursed.svg"
  };
}
