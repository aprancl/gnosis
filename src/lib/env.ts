/**
 * Environment variable validation.
 * Import this module early to get clear error messages for missing configuration.
 */

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Please check your .env file. See .env.example for reference.`
    );
  }
  return value;
}

function getOptionalEnvVar(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

/** Server-side only environment variables */
export const serverEnv = {
  get CLERK_SECRET_KEY() {
    return getRequiredEnvVar("CLERK_SECRET_KEY");
  },
  get DATABASE_URL() {
    return getRequiredEnvVar("DATABASE_URL");
  },
  get GROQ_API_KEY() {
    return getRequiredEnvVar("GROQ_API_KEY");
  },
  get GROQ_MODEL_ID() {
    return getOptionalEnvVar("GROQ_MODEL_ID", "openai/gpt-oss-120b");
  },
};

/** Client-safe environment variables (NEXT_PUBLIC_ prefix) */
export const clientEnv = {
  get CLERK_PUBLISHABLE_KEY() {
    return getRequiredEnvVar("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  },
};
