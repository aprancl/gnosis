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
  get SUPABASE_SERVICE_ROLE_KEY() {
    return getRequiredEnvVar("SUPABASE_SERVICE_ROLE_KEY");
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
  get SUPABASE_URL() {
    return getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL");
  },
  get SUPABASE_ANON_KEY() {
    return getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
};
