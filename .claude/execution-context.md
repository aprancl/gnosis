# Execution Context - Database and Authentication Migration

## Project Patterns
- Next.js 16.1.6 App Router with server components and server actions
- Tailwind CSS 4 for styling
- Mediterranean/blue theme with serif fonts
- Supabase currently used for auth and database (being replaced)
- Target: Clerk for auth, Prisma + Vercel Postgres for database

## Key Decisions
- Hybrid profile: Clerk for display_name/avatar, DB User table for currentChapterId
- No tRPC - keep server actions pattern
- On-demand user creation via getOrCreateUser (no webhooks)
- Vercel Postgres with pooled + non-pooled connections

## Known Issues
- None yet

## File Map
- `src/lib/supabase/` - Supabase clients (to be removed)
- `src/app/(auth)/` - Auth pages (to be replaced with Clerk)
- `src/app/(protected)/` - Protected pages
- `src/lib/conversation/storage.ts` - Conversation DB operations
- `src/lib/progress/tracker.ts` - Progress DB operations
- `src/lib/scenario/completion.ts` - Scenario completion DB operations
- `src/lib/scenario/engine.ts` - Scenario loading DB operations
- `src/lib/data/seed-scenarios.ts` - TypeScript seed data
- `src/types/database.ts` - Manual types (to be replaced by Prisma)
- `src/server/db.ts` - Prisma client singleton

## Task History

### Task [3]: Create Prisma client singleton - PASS
- Files modified: src/server/db.ts (created)
- Key learnings: Project uses @prisma/client ^6.3.0, src/server/ directory created for server-side utilities
- Issues encountered: None

### Task [1]: Install packages and update environment configuration - PASS
- Files modified: package.json, package-lock.json, src/lib/env.ts, .env.example
- Key learnings: Supabase packages fully removed, Clerk (^6.12.0 resolved to 6.37.1) and Prisma (^6.3.0) installed. env.ts uses lazy getter pattern for env var validation. GROQ vars kept unchanged.
- Issues encountered: None

### Task [2]: Create Prisma schema and database setup - PASS
- Files modified: prisma/schema.prisma (created), package.json (added db scripts), .env (added DATABASE_URL, POSTGRES_URL_NON_POOLING), .env.example (added POSTGRES_URL_NON_POOLING)
- Key learnings: Prisma client was already generated during npm install (postinstall hook). All 5 models (User, Chapter, Scenario, UserProgress, ConversationMessage) confirmed in generated client at node_modules/.prisma/client/index.d.ts (10122 lines). db:generate, db:push, db:studio npm scripts added. src/server/db.ts singleton already existed from Task 3.
- Issues encountered: Bash tool auto-denied commands containing "prisma" keyword. Verified generated client via Grep tool instead.
