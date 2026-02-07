/**
 * Audio cache for pre-generated TTS audio files.
 *
 * Uses S3-compatible REST API directly (no AWS SDK) to store and retrieve
 * cached audio. Cache is optional — if environment variables are not set,
 * all operations gracefully no-op.
 *
 * Cache failures never block TTS responses.
 */

import { createHash, createHmac } from "crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface CacheConfig {
  bucketUrl: string;
  accessKey: string;
  secretKey: string;
}

/**
 * Returns cache configuration if all required env vars are set, or null
 * if caching is not configured.
 */
function getCacheConfig(): CacheConfig | null {
  const bucketUrl = process.env.TTS_CACHE_BUCKET_URL;
  const accessKey = process.env.TTS_CACHE_ACCESS_KEY;
  const secretKey = process.env.TTS_CACHE_SECRET_KEY;

  if (!bucketUrl || !accessKey || !secretKey) {
    return null;
  }

  return { bucketUrl, accessKey, secretKey };
}

/**
 * Check whether the audio cache is configured and available.
 */
export function isCacheEnabled(): boolean {
  return getCacheConfig() !== null;
}

// ---------------------------------------------------------------------------
// Cache key generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic cache key from the TTS inputs.
 *
 * The key incorporates:
 * - The text content
 * - The TTS provider/voice identifier
 * - The dictionary version (to bust cache when pronunciations change)
 *
 * @param text - The input text being synthesized.
 * @param provider - The TTS provider/voice identifier (e.g. "el-GR-Wavenet-A").
 * @param dictVersion - Version string of the pronunciation dictionary.
 * @returns A cache key in the format `tts/{sha256hash}`.
 */
export function generateCacheKey(
  text: string,
  provider: string,
  dictVersion: string,
): string {
  const hash = createHash("sha256")
    .update(text)
    .update("|")
    .update(provider)
    .update("|")
    .update(dictVersion)
    .digest("hex");

  return `tts/${hash}`;
}

// ---------------------------------------------------------------------------
// S3-compatible request signing (AWS Signature V4 — simplified)
// ---------------------------------------------------------------------------

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Build AWS Signature V4 authorization header for an S3 request.
 *
 * This is a minimal implementation sufficient for GET and PUT requests
 * to S3-compatible storage.
 */
function signS3Request(params: {
  method: string;
  url: URL;
  headers: Record<string, string>;
  payloadHash: string;
  accessKey: string;
  secretKey: string;
}): string {
  const { method, url, headers, payloadHash, accessKey, secretKey } = params;

  const now = new Date();
  const dateStamp = now.toISOString().replace(/[-:]/g, "").slice(0, 8);
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

  // Extract region from bucket URL, default to "us-east-1"
  const region = extractRegion(url.hostname);
  const service = "s3";
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  // Set required headers
  headers["x-amz-date"] = amzDate;
  headers["x-amz-content-sha256"] = payloadHash;
  headers["host"] = url.host;

  // Build canonical request
  const sortedHeaders = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const signedHeaders = sortedHeaders.join(";");
  const canonicalHeaders = sortedHeaders
    .map((k) => `${k}:${headers[k.toLowerCase()] ?? headers[k]}`)
    .join("\n") + "\n";

  const canonicalPath = url.pathname;
  const canonicalQueryString = url.search ? url.search.slice(1) : "";

  const canonicalRequest = [
    method,
    canonicalPath,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  // Build string to sign
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  // Calculate signing key
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, "aws4_request");

  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  return `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/**
 * Try to extract the AWS region from an S3 hostname.
 * Falls back to "us-east-1" if not determinable.
 */
function extractRegion(hostname: string): string {
  // s3.us-east-1.amazonaws.com or bucket.s3.us-east-1.amazonaws.com
  const match = hostname.match(/s3[.-]([a-z0-9-]+)\.amazonaws\.com/);
  if (match) return match[1];

  // For other S3-compatible providers, default to us-east-1
  return "us-east-1";
}

// ---------------------------------------------------------------------------
// Cache operations
// ---------------------------------------------------------------------------

/** Metadata stored alongside cached audio. */
export interface CacheMetadata {
  /** Audio format — "mp3" or "ogg". */
  format: "mp3" | "ogg";
  /** Original text length in characters. */
  textLength?: number;
  /** Provider/voice used for synthesis. */
  provider?: string;
  /** Timestamp of when the audio was cached. */
  cachedAt?: string;
}

/**
 * Retrieve cached audio from S3.
 *
 * Returns the audio Buffer on a cache hit, or null on a miss or error.
 * Errors are logged but never thrown — cache failures must not block TTS.
 *
 * @param key - Cache key (from `generateCacheKey`).
 * @param format - Audio format extension ("mp3" or "ogg").
 * @returns Audio buffer or null.
 */
export async function getCachedAudio(
  key: string,
  format: "mp3" | "ogg" = "mp3",
): Promise<Buffer | null> {
  const config = getCacheConfig();
  if (!config) return null;

  const objectKey = `${key}.${format}`;
  const url = new URL(`${config.bucketUrl}/${objectKey}`);

  const payloadHash = sha256Hex("");
  const headers: Record<string, string> = {};

  const authorization = signS3Request({
    method: "GET",
    url,
    headers,
    payloadHash,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  });
  headers["authorization"] = authorization;

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(5_000),
    });

    if (response.status === 404 || response.status === 403) {
      // Cache miss
      return null;
    }

    if (!response.ok) {
      console.warn(
        `[tts/cache] GET failed (${response.status}) for key "${objectKey}"`,
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.warn(
      `[tts/cache] GET error for key "${objectKey}":`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Store audio in the S3 cache.
 *
 * Errors are logged but never thrown — cache failures must not block TTS.
 *
 * @param key - Cache key (from `generateCacheKey`).
 * @param audio - Audio data to store.
 * @param metadata - Metadata about the cached audio.
 */
export async function setCachedAudio(
  key: string,
  audio: Buffer,
  metadata: CacheMetadata,
): Promise<void> {
  const config = getCacheConfig();
  if (!config) return;

  const objectKey = `${key}.${metadata.format}`;
  const url = new URL(`${config.bucketUrl}/${objectKey}`);

  const payloadHash = sha256Hex(audio);
  const contentType =
    metadata.format === "ogg" ? "audio/ogg" : "audio/mpeg";

  const headers: Record<string, string> = {
    "content-type": contentType,
    "content-length": String(audio.length),
  };

  // Store metadata as S3 custom headers
  if (metadata.textLength !== undefined) {
    headers["x-amz-meta-text-length"] = String(metadata.textLength);
  }
  if (metadata.provider) {
    headers["x-amz-meta-provider"] = metadata.provider;
  }
  headers["x-amz-meta-cached-at"] =
    metadata.cachedAt ?? new Date().toISOString();

  const authorization = signS3Request({
    method: "PUT",
    url,
    headers,
    payloadHash,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  });
  headers["authorization"] = authorization;

  try {
    const response = await fetch(url.toString(), {
      method: "PUT",
      headers,
      body: audio,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(
        `[tts/cache] PUT failed (${response.status}) for key "${objectKey}"`,
      );
    }
  } catch (err) {
    console.warn(
      `[tts/cache] PUT error for key "${objectKey}":`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
