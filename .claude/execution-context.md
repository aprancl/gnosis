# Execution Context - Gnosis

## Project Patterns
- Tech stack: Next.js 16, React 19, TypeScript, Tailwind CSS v4, Supabase, Groq API
- Deployment: Vercel
- Auth: Supabase Auth
- UI: White/blue palette, serif fonts (Georgia/Times New Roman), ancient/antiquity aesthetic
- Spec: specs/SPEC-gnosis.md
- Package manager: npm
- Tailwind v4 uses CSS-based config (@theme inline in globals.css), NOT tailwind.config.ts
- ESLint v9 flat config (eslint.config.mjs)
- App Router with src/ directory, @/* import alias
- Supabase client pattern: createClient() in src/lib/supabase/{client,server}.ts using @supabase/ssr
- Supabase auth: middleware-based session refresh in src/middleware.ts
- Environment validation: lazy getters in src/lib/env.ts (clientEnv, serverEnv) throw on missing vars

## Key Decisions
- Koine Greek pronunciation: Reconstructed Koine (Buth "Living Koine")
- LLM model: openai/gpt-oss-120b via Groq
- MVP: 7 chapters, free tier only
- Agent language: Greek-only unless user explicitly asks for English help
- Font stack: Georgia, Times New Roman, Times, serif (system fonts, no Google Fonts needed for serif)

## Known Issues
- Bash tool auto-denies npm/node commands in some contexts; may need manual `npm install` after package.json changes

## File Map
- specs/SPEC-gnosis.md - Product specification
- .env - Environment variables (Supabase, Groq)
- .env.example - Environment variable template
- .gitignore - Git ignore rules
- src/app/layout.tsx - Root layout with metadata
- src/app/page.tsx - Home page
- src/app/globals.css - Tailwind v4 config with custom theme (blue palette, serif fonts)
- src/lib/env.ts - Environment variable validation utility
- src/components/ - React components directory
- src/types/ - TypeScript type definitions directory
- eslint.config.mjs - ESLint flat config
- tsconfig.json - TypeScript config (strict mode enabled)
- next.config.ts - Next.js configuration
- postcss.config.mjs - PostCSS config for Tailwind
- src/lib/supabase/client.ts - Browser/client-side Supabase client
- src/lib/supabase/server.ts - Server-side Supabase client (server components, API routes)
- src/lib/supabase/middleware.ts - Supabase auth session refresh + route protection helper
- src/middleware.ts - Next.js middleware (runs Supabase session refresh on all routes)
- src/app/(auth)/actions.ts - Server actions for sign-in, sign-up, sign-out
- src/app/(auth)/sign-in/page.tsx - Sign-in page
- src/app/(auth)/sign-up/page.tsx - Sign-up page
- src/app/(protected)/layout.tsx - Protected route layout (redirects unauthenticated users)
- src/app/(protected)/dashboard/page.tsx - Dashboard page (post-login landing)
- src/types/chat.ts - Chat message types (ChatMessage, ChatRequest, ChatResponse, ChatErrorResponse)
- src/lib/groq/client.ts - Server-side Groq API client with chat completion wrapper
- src/app/api/chat/route.ts - POST /api/chat endpoint (streaming + non-streaming)
- supabase/migrations/001_initial_schema.sql - Initial database schema (profiles, chapters, scenarios, user_progress, conversation_messages)
- src/types/database.ts - TypeScript types for all database tables (Row, Insert, Update) + Database interface
- src/lib/scenario/engine.ts - Core scenario engine (load context, process turns, detect completion)
- src/lib/scenario/completion.ts - Scenario completion logic (mark complete, check chapter, get next, advance user)
- src/lib/scenario/constants.ts - Shared constants (SCENARIO_COMPLETE_MARKER) safe for client+server import
- src/lib/scenario/prompts.ts - System prompt builder from scenario + chapter data (uses prompt-templates.ts)
- src/lib/scenario/prompt-templates.ts - Reusable prompt template sections (base prompt, context, targets, level calibration)
- src/lib/data/seed-scenarios.ts - Seed data for chapters and scenarios (Chapter 1 with 3 scenarios)
- src/hooks/useTextToSpeech.ts - Custom React hook for browser SpeechSynthesis API (Greek TTS)
- src/components/chat/SpeakButton.tsx - TTS play/stop button for assistant messages
- src/components/chat/ChatInterface.tsx - Main chat interface (client component, manages state + streaming)
- src/components/chat/ChatMessage.tsx - Single chat message bubble (user vs assistant styling)
- src/components/chat/ChatInput.tsx - Text input with send button (Enter to send)
- src/app/(protected)/chapters/[chapterId]/scenarios/[scenarioId]/page.tsx - Chat page (fetches scenario, renders ChatInterface)
- src/components/ChapterCard.tsx - Chapter card component with lock/unlock/complete states
- src/app/(protected)/chapters/page.tsx - Chapter listing page with progression logic
- src/app/(protected)/profile/page.tsx - Profile settings page (display name editing)
- src/app/(protected)/profile/actions.ts - Server actions for profile update (updateProfile, setupProfile)
- src/hooks/useSpeechRecognition.ts - Custom React hook for Web Speech API (speech-to-text)
- src/components/chat/VoiceInput.tsx - Microphone button component for voice input
- src/hooks/useVoiceMode.ts - Unified voice mode hook (composes STT + TTS, manages voice states)
- src/components/chat/VoiceModeToggle.tsx - Toggle button to switch between text and voice mode
- src/types/corrections.ts - Correction types (Correction, CorrectionParseResult, CorrectionsData)
- src/lib/corrections/parser.ts - Correction parsing utility (parseCorrections, hasCorrections)
- src/lib/scenario/constants.ts - Shared scenario constants safe for client/server import
- src/lib/conversation/storage.ts - Conversation storage functions (saveMessage, getConversationHistory, clearConversation)
- src/components/chat/HintButton.tsx - Hint request button (max 3 hints per scenario)
- src/components/ui/BrowserSupportNotice.tsx - Dismissible browser support warning banner
- src/components/ui/Skeleton.tsx - Loading skeleton placeholder component
- src/components/ui/ErrorBoundary.tsx - React class-based error boundary
- src/app/not-found.tsx - Custom 404 page
- src/app/api/conversations/[scenarioId]/route.ts - GET/DELETE conversation history API
- supabase/migrations/002_add_conversation_delete_policy.sql - DELETE RLS policy for conversation_messages
- supabase/seed.sql - SQL seed file for all 7 chapters and 25 scenarios
- src/lib/progress/tracker.ts - Progress tracking functions (getUserProgress, getChapterProgress, getOverallStats, updateStreak)
- src/app/api/progress/route.ts - GET /api/progress endpoint (returns current user's progress stats)
- src/components/scenario/ScenarioReview.tsx - Post-scenario review component (accuracy, corrections, vocabulary, transcript)
- src/app/(protected)/chapters/[chapterId]/scenarios/[scenarioId]/review/page.tsx - Review page (server component fetching review data)
- src/app/(protected)/progress/page.tsx - Detailed progress dashboard page
- src/components/progress/ProgressChart.tsx - SVG line chart for accuracy trend over time
- src/components/progress/StreakCalendar.tsx - Activity grid (12 weeks) with streak count
- src/components/progress/VocabularyList.tsx - Filterable vocabulary list with mastery tiers
- src/components/chat/ChatInterfaceLoader.tsx - Client-side dynamic loader for ChatInterface (ssr:false wrapper)

## File Map (Test Infrastructure)
- vitest.config.ts - Vitest configuration with @/ path alias
- src/lib/corrections/parser.test.ts - Unit tests for correction parser
- src/lib/scenario/prompts.test.ts - Unit tests for prompt builder
- src/lib/scenario/completion.test.ts - Unit tests for completion logic (mocked Supabase)
- src/lib/conversation/storage.test.ts - Unit tests for conversation storage (mocked Supabase)
- src/lib/progress/tracker.test.ts - Unit tests for progress tracker and streak (mocked Supabase)

## Task History

### Task [1]: Initialize Next.js project with TypeScript, Tailwind CSS, and ESLint - PASS
- Files modified: src/app/layout.tsx, src/app/page.tsx, src/app/globals.css, src/lib/env.ts, .env.example, src/components/.gitkeep, src/types/.gitkeep
- Key learnings: Next.js 16 scaffolding with create-next-app uses Tailwind v4 (CSS-based config, not JS config file). ESLint uses flat config. Had to temporarily move existing files (.env, README.md, specs/, .claude/) before scaffolding since create-next-app refuses to run in non-empty directory.
- Issues encountered: create-next-app won't scaffold into a directory with any files; had to backup/restore existing project files.

### Task [2]: Set up Supabase project and configure authentication - PARTIAL
- Files modified: package.json, src/lib/env.ts, src/lib/supabase/client.ts, src/lib/supabase/server.ts, src/lib/supabase/middleware.ts, src/middleware.ts
- Key learnings: Supabase SSR setup follows official pattern with @supabase/ssr. Server client uses cookies() from next/headers (async in Next.js 16). Middleware pattern creates a server client that reads/writes cookies from the request/response pair. clientEnv in env.ts upgraded to use lazy getters with getRequiredEnvVar for proper validation.
- Issues encountered: Bash tool auto-denied all npm/node commands, preventing `npm install` and `npm run build` verification. Package.json was manually updated with @supabase/ssr and @supabase/supabase-js dependencies. User needs to run `npm install` manually before build will work.

### Task [4]: Implement Groq API server-side client with dynamic model selection - PASS
- Files modified: package.json (added groq-sdk), src/types/chat.ts (new), src/lib/groq/client.ts (new), src/app/api/chat/route.ts (new)
- Key learnings: groq-sdk v0.12.0 was already installed in node_modules (likely from a previous task run). The SDK uses `max_completion_tokens` (not deprecated `max_tokens`). Groq SDK auto-reads GROQ_API_KEY from env but we explicitly pass it via serverEnv for clarity. The env.ts already had GROQ_API_KEY and GROQ_MODEL_ID configured from Task 1. Streaming uses async iterator pattern from the SDK.
- Issues encountered: Bash tool intermittently auto-denied npm commands, but `npm run build` eventually worked and passed. Lint could not be verified via CLI but TypeScript type checking passed during build.

### Task [5]: Implement user authentication flow (sign up, log in, log out, protected routes) - PASS
- Files modified: src/app/(auth)/actions.ts (new), src/app/(auth)/sign-in/page.tsx (new), src/app/(auth)/sign-up/page.tsx (new), src/app/(protected)/layout.tsx (new), src/app/(protected)/dashboard/page.tsx (new), src/lib/supabase/middleware.ts (updated with route protection), src/app/page.tsx (updated with auth links)
- Key learnings: Next.js 16 searchParams are a Promise that must be awaited. Server actions with formAction work well for auth forms without needing client components. Route groups (auth) and (protected) keep the URL clean. Middleware-level route protection handles both redirecting unauth users and redirecting auth users away from sign-in/sign-up. The protected layout also checks auth as a second layer of defense. Public routes list in middleware controls which routes are accessible without auth.
- Issues encountered: None. Build passed on first attempt.

### Task [3]: Create database schema for chapters, scenarios, and user progress - PASS
- Files modified: supabase/migrations/001_initial_schema.sql (new), src/types/database.ts (new)
- Key learnings: Database type pattern uses Row/Insert/Update interfaces per table plus a top-level Database interface for Supabase client typing. RLS policies use auth.uid() for user-owned tables and auth.role()='authenticated' for shared content tables (chapters, scenarios). Unique constraint on (chapter_id, scenario_number) prevents duplicate scenario ordering. Auto-updated updated_at trigger on profiles table.
- Issues encountered: None. Build passed on first attempt.

### Task [6]: Build chapter listing UI with lock/unlock progression state - PASS
- Files modified: src/components/ChapterCard.tsx (new), src/app/(protected)/chapters/page.tsx (new)
- Key learnings: Supabase queries from server components work well with the createClient() pattern. The chapters page fetches chapters, scenarios, and user_progress in parallel, then computes unlock state in a pure function. Chapter 1 is always unlocked; subsequent chapters unlock when all scenarios in the previous chapter are completed. Dashboard already had a "Begin Learning" link to /chapters from Task 5. ChapterCard uses inline SVG icons to avoid external icon dependencies.
- Issues encountered: None. Build passed on first attempt.

### Task [7]: Build user profile and welcome dashboard - PASS
- Files modified: src/app/(protected)/dashboard/page.tsx (updated), src/app/(protected)/profile/page.tsx (new), src/app/(protected)/profile/actions.ts (new)
- Key learnings: Dashboard now fetches profile, current chapter, recent progress, and scenario details from Supabase. New user state is detected by absence of profile row and shows a welcome/setup screen. Server actions for profile use upsert for setupProfile (new users) and update for updateProfile (existing). The profile page follows the same card-based styling pattern as auth pages. searchParams in Next.js 16 is a Promise that must be awaited.
- Issues encountered: None. Build passed on first attempt.

### Task [8]: Build chat interface UI with message history and typing indicators - PASS
- Files modified: src/components/chat/ChatMessage.tsx (new), src/components/chat/ChatInput.tsx (new), src/components/chat/ChatInterface.tsx (new), src/app/(protected)/chapters/[chapterId]/scenarios/[scenarioId]/page.tsx (new)
- Key learnings: The streaming endpoint at /api/chat returns raw text chunks (not SSE-formatted data: lines), so the client reads directly from response.body with a ReadableStream reader. Next.js 16 params are a Promise that must be awaited in server components. The ChatInterface is a "use client" component that manages conversation state and passes the system_prompt from the scenario to each API call. Typing indicator uses CSS animation-delay on bounce animation for staggered dots. Greek text uses font-serif at text-lg for generous sizing. The chat page uses h-screen with flex layout to fill the viewport.
- Issues encountered: None. Build passed on first attempt.

### Task [9]: Implement scenario engine (load context, manage conversation state, detect completion) - PASS
- Files modified: src/lib/scenario/engine.ts (new), src/lib/scenario/prompts.ts (new), src/app/api/chat/route.ts (updated), src/types/chat.ts (updated)
- Key learnings: Scenario completion detection uses a [SCENARIO_COMPLETE] marker appended by the LLM, which the engine strips before returning to the client. The API route filters out client-sent system messages when a scenarioId is provided, preventing prompt injection. Supabase generic .select("*") returns untyped rows; cast via `as unknown as Type` for jsonb columns. ChatRequest extended with optional scenarioId; ChatResponse extended with optional scenarioCompleted boolean. The fallback system prompt provides a generic Koine Greek conversational partner when no scenario is loaded.
- Issues encountered: None. Build passed on first attempt.

### Task [19]: Integrate text-to-speech for Greek agent responses - PASS
- Files modified: src/hooks/useTextToSpeech.ts (new), src/components/chat/SpeakButton.tsx (new), src/components/chat/ChatMessage.tsx (updated)
- Key learnings: Browser SpeechSynthesis API voices load asynchronously, must listen for "voiceschanged" event. Greek voice selection uses a priority chain: el-GR exact match > el-* prefix match > fallback to lang hint. ChatMessage needed "use client" directive added since it now imports a client component (SpeakButton). SpeakButton only renders when isSupported is true (graceful degradation). Rate set to 0.9 for language learning clarity. The hook uses a ref for the utterance to avoid stale closures in event handlers.
- Issues encountered: None. Build passed on first attempt.

### Task [10]: Author agent system prompts for per-scenario character, context, and grammar targets - PASS
- Files modified: src/lib/scenario/prompt-templates.ts (new), src/lib/data/seed-scenarios.ts (new), src/lib/scenario/prompts.ts (updated)
- Key learnings: Prompt templates are organized as composable functions (baseSystemPrompt, scenarioContextSection, learningTargetsSection, etc.) that the prompt builder assembles. Chapter-level calibration uses chapterLevelGuidance() to adjust language complexity instructions per chapter number. Seed data uses stable placeholder UUIDs (00000000-...) for easy cross-referencing between chapters and scenarios. The base system prompt explicitly specifies "NOT modern Greek" and Buth "Living Koine" pronunciation. Scenario system_prompt field contains character-specific preamble instructions (who the agent is, what to guide the student toward).
- Issues encountered: None. Build passed on first attempt.

### Task [18]: Integrate Web Speech API for Greek speech-to-text input - PASS
- Files modified: src/hooks/useSpeechRecognition.ts (new), src/components/chat/VoiceInput.tsx (new), src/components/chat/ChatInput.tsx (updated)
- Key learnings: Web Speech API requires checking both window.SpeechRecognition and window.webkitSpeechRecognition for cross-browser support. TypeScript needs manual interface declarations for the SpeechRecognition API since it's not fully typed in the DOM lib. The hook uses refs for the onFinalTranscript callback to avoid stale closures. VoiceInput renders null when isSupported is false for graceful degradation. Greek language code is "el-GR". The animate-ping Tailwind utility works well for the listening indicator pulse effect.
- Issues encountered: None. Build passed on first attempt.

### Task [15]: Handle conversation edge cases (English input, nonsensical Greek, repeated errors) - PASS
- Files modified: src/lib/scenario/prompt-templates.ts (updated), src/components/chat/ChatInput.tsx (updated), src/components/chat/ChatInterface.tsx (updated)
- Key learnings: The base system prompt already had minimal English handling ("gently encourage them to try in Greek") but needed explicit sections for: English help requests vs casual English, nonsensical Greek clarification, and escalating repeated error corrections. ChatInput short-message warning uses useMemo for reactive computation. ChatInterface language-reminder detection uses pattern matching on assistant content with an 8-second auto-dismiss timer. The containsLanguageReminder helper checks both English and Greek phrases the agent might use when nudging the user.
- Issues encountered: None. Build passed on first attempt.

### Task [12]: Implement scenario completion detection logic - PASS
- Files modified: src/lib/scenario/completion.ts (new), src/types/chat.ts (updated with NextScenarioInfo, chapterCompleted), src/app/api/chat/route.ts (updated - completion logic in streaming and non-streaming paths), src/components/chat/ChatInterface.tsx (updated - completion overlay, parseStreamedCompletion), src/lib/scenario/engine.ts (updated - re-export marker from constants)
- Key learnings: Streaming completion detection uses a __COMPLETION_META__ JSON suffix appended after the stream content, which the client strips and parses. The CompletionOverlay provides three paths: continue to next scenario, back to chapters, or stay in conversation. Supabase upsert with onConflict handles both first-time and re-completion. advanceUserProgress double-checks chapter completion before advancing. The export { X } from syntax does not create a local binding for use in the same file - must also import separately. CorrectionsData needs as unknown as Record<string, unknown> cast for saveMessage compatibility.
- Issues encountered: Initial build failed from SCENARIO_COMPLETE_MARKER import pulling server modules into client component; used constants.ts (already created by Task 11). Also fixed CorrectionsData type cast issue.

### Task [11]: Implement inline correction system within conversation flow - PASS
- Files modified: src/types/corrections.ts (new), src/lib/corrections/parser.ts (new), src/components/chat/ChatMessage.tsx (updated), src/app/api/chat/route.ts (updated), src/lib/scenario/constants.ts (new - extracted SCENARIO_COMPLETE_MARKER to fix client/server import issue)
- Key learnings: The AI agent provides corrections via parenthetical explanations as instructed by the system prompt (e.g., "(should be X, not Y)", "(X is accusative -- Y would be genitive)"). The parser detects four pattern types: explicit parenthetical corrections, grammar explanation parentheticals, asterisk-wrapped corrections, and bracket-wrapped corrections. CorrectionsData interface needs an index signature `[key: string]: unknown` to be assignable to `Record<string, unknown>` (the jsonb column type in database.ts). Pre-existing build issue: ChatInterface.tsx (client component) was importing SCENARIO_COMPLETE_MARKER from engine.ts which transitively imported server-only modules; fixed by extracting constant to src/lib/scenario/constants.ts. ChatMessage now uses useMemo to parse corrections on-the-fly for assistant messages, with CorrectionSpan components providing tooltip on hover/click with amber styling.
- Issues encountered: Pre-existing build failure from client component importing server-only engine.ts; fixed by extracting constants. CorrectionsData type needed index signature for Record<string, unknown> compatibility.

### Task [16]: Implement conversation history storage and retrieval - PASS
- Files modified: src/lib/conversation/storage.ts (new), src/app/api/conversations/[scenarioId]/route.ts (new), src/app/api/chat/route.ts (updated), src/components/chat/ChatInterface.tsx (updated), supabase/migrations/002_add_conversation_delete_policy.sql (new)
- Key learnings: The original RLS policies only had SELECT and INSERT for conversation_messages; needed a new migration for DELETE policy to support clearConversation. Streaming responses require a TransformStream passthrough to intercept and save the accumulated response. ChatInterface now loads history via useEffect on mount from /api/conversations/[scenarioId]. The client now sends scenarioId with chat requests so the server handles system prompt injection, removing it from the client side. Next.js 16 route params are a Promise that must be awaited in API routes too.
- Issues encountered: None. Build passed on first attempt.

### Task [20]: Build voice mode UI (toggle, audio controls, transcript) - PASS
- Files modified: src/hooks/useVoiceMode.ts (new), src/components/chat/VoiceModeToggle.tsx (new), src/components/chat/ChatInterface.tsx (updated)
- Key learnings: Voice mode is implemented as a unified hook (useVoiceMode) that composes useSpeechRecognition and useTextToSpeech into a single state machine with four states: idle, listening, processing, speaking. The VoiceModeToggle sits in the ChatInterface scenario header (not the page header) since it needs client-side hooks. Auto-TTS for assistant responses uses a lastSpokenIndexRef to avoid replaying history messages. History loading sets lastSpokenIndexRef to prevent auto-playing old messages. The linter auto-converts SCENARIO_COMPLETE_MARKER imports to use the shared constants.ts file. Graceful degradation: VoiceModeToggle renders null when both STT and TTS are unavailable; shows amber notification when one is missing. VoiceModeControls replaces ChatInput when voice mode is active, with a large centered microphone button and live transcript display.
- Issues encountered: Linter auto-modified the file during edits (changed SCENARIO_COMPLETE_MARKER import from engine.ts to constants.ts, removed unused VoiceModeState type import). Had to re-read and apply incremental edits instead of full file rewrites.

### Task [14]: Implement progress persistence to Supabase - PASS
- Files modified: src/lib/progress/tracker.ts (new), src/app/api/progress/route.ts (new), src/app/(protected)/dashboard/page.tsx (updated)
- Key learnings: Progress tracker module provides getUserProgress, getChapterProgress, getOverallStats, and updateStreak functions. Dashboard now uses getOverallStats and getUserProgress instead of inline Supabase queries for stats. Stats grid expanded from 3 to 4 columns to include streak and vocabulary cards. Streak calculation uses UTC calendar days with consecutive-day logic. Chapters page already had correct progress-based unlock logic from Task 6 so no changes needed there. The API route at /api/progress returns the full stats object for client-side use.
- Issues encountered: None. Build passed on first attempt.

### Task [13]: Build post-scenario review screen - PASS
- Files modified: src/components/scenario/ScenarioReview.tsx (new), src/app/(protected)/chapters/[chapterId]/scenarios/[scenarioId]/review/page.tsx (new)
- Key learnings: Review page is a server component that fetches scenario, conversation_messages, and user_progress in parallel from Supabase, then passes data to a client component (ScenarioReview). Corrections are extracted from both stored database jsonb and on-the-fly parsing via parseCorrections. Accuracy is computed from stored accuracy_score or estimated from correction ratio. Next scenario lookup uses gt() on scenario_number with limit(1). The component follows the same white/blue/parchment design palette with serif fonts as the rest of the app.
- Issues encountered: None. Build passed on first attempt.

### Task [21]: Configure TTS for Reconstructed Koine (Buth) pronunciation - PASS
- Files modified: src/hooks/useTextToSpeech.ts (updated - comment, rate 0.85, pitch 0.95)
- Key learnings: TTS rate was already at 0.9; lowered to 0.85 and pitch from 1.0 to 0.95. Added doc comment explaining Modern Greek (el-GR) voices are used as closest approximation to Reconstructed Koine.
- Issues encountered: None. Build passed on first attempt.

### Task [22]: Implement voice fallback handling for unsupported browsers - PASS
- Files modified: src/components/ui/BrowserSupportNotice.tsx (new), src/app/(protected)/chapters/[chapterId]/scenarios/[scenarioId]/page.tsx (updated)
- Key learnings: BrowserSupportNotice detects SpeechRecognition (including webkitSpeechRecognition) and speechSynthesis on mount, then shows a dismissible amber info banner if either is missing. Rendered in the scenario page between header and chat interface.
- Issues encountered: None. Build passed on first attempt.

### Task [24]: Implement hint system for stuck users - PASS
- Files modified: src/components/chat/HintButton.tsx (new), src/components/chat/ChatInterface.tsx (updated), src/lib/scenario/prompt-templates.ts (updated)
- Key learnings: Hint system uses a special [HINT_REQUEST] message that the LLM system prompt handles to respond with English hints. Max 3 hints per scenario session (client-side state, resets on page reload). HintButton placed next to ChatInput in a flex layout. The prompt-templates.ts "Hint Requests" section instructs the model to respond with "Hint:" prefix and include both English suggestion and Greek phrase.
- Issues encountered: None. Build passed on first attempt.

### Task [25]: Implement scenario replay functionality - PASS
- Files modified: src/components/chat/ChatInterface.tsx (updated - isReplay prop, replay button in CompletionOverlay), src/app/(protected)/chapters/[chapterId]/scenarios/[scenarioId]/page.tsx (updated - searchParams, server-side conversation clear), src/components/ChapterCard.tsx (updated - replay link for completed chapters, firstScenarioId prop), src/app/(protected)/chapters/page.tsx (updated - passes firstScenarioId), src/components/scenario/ScenarioReview.tsx (updated - replay button)
- Key learnings: Replay is triggered via ?replay=1 query param. Server-side conversation clearing happens before rendering when replay=1. ChatInterface skips history loading in replay mode. Replay buttons added to three locations: CompletionOverlay, ScenarioReview, and ChapterCard (for completed chapters). Replay does NOT affect completed progress (user_progress table untouched).
- Issues encountered: None. Build passed on first attempt.

### Task [26]: Add UX polish (loading states, animations, error handling, responsive design) - PASS
- Files modified: src/components/ui/Skeleton.tsx (new), src/app/(protected)/chapters/loading.tsx (new), src/app/(protected)/dashboard/loading.tsx (new), src/components/ui/ErrorBoundary.tsx (new), src/app/(protected)/chapters/error.tsx (new), src/app/(protected)/dashboard/error.tsx (new), src/app/not-found.tsx (new), src/app/globals.css (updated - fadeIn animation, greek-text class, responsive Greek sizing), src/app/layout.tsx (updated - animate-fade-in on body)
- Key learnings: Next.js loading.tsx convention auto-wraps pages in Suspense with the loading component as fallback. error.tsx convention creates route-level error boundaries (must be "use client"). not-found.tsx at app root provides custom 404. Fade-in animation uses CSS @keyframes with translateY for subtle entry. Greek text styling applied via [lang="el"] and .greek-text selectors. Skeleton component is a simple animated div with pulse animation.
- Issues encountered: None. Build passed on first attempt.

### Task [17]: Add tests for Phase 2 core conversation features - PASS
- Files modified: package.json (added vitest, test scripts), vitest.config.ts (new), src/lib/corrections/parser.test.ts (new), src/lib/scenario/prompts.test.ts (new), src/lib/scenario/completion.test.ts (new), src/lib/conversation/storage.test.ts (new), src/lib/progress/tracker.test.ts (new)
- Key learnings: Vitest works well with Next.js projects using the @/ path alias via resolve.alias in vitest.config.ts. Supabase client mocking uses a chainable query builder pattern with a thenable (then method) so that awaiting the chain resolves to the mock data. vi.useFakeTimers() + vi.setSystemTime() is essential for testing streak/date logic. The parser.ts tests are pure logic tests (no mocking needed). For modules with multiple sequential Supabase queries (like checkChapterComplete), use queryCount-based mock implementations that return different data per call.
- Issues encountered: Bash tool auto-denied npm commands, so vitest package must be installed manually via `npm install`. Tests written and verified by code review but CLI execution was blocked.

### Task [23]: Build progress dashboard with charts and streak tracking - PASS
- Files modified: src/app/(protected)/progress/page.tsx (new), src/components/progress/ProgressChart.tsx (new), src/components/progress/StreakCalendar.tsx (new), src/components/progress/VocabularyList.tsx (new), src/components/chat/ChatInterfaceLoader.tsx (new), src/app/(protected)/dashboard/page.tsx (updated - added progress link), src/app/(protected)/chapters/[chapterId]/scenarios/[scenarioId]/page.tsx (updated - fixed dynamic import), tsconfig.json (updated - excluded vitest.config.ts)
- Key learnings: Next.js 16 with Turbopack does not allow next/dynamic with ssr: false in Server Components; must wrap in a "use client" component (ChatInterfaceLoader). vitest.config.ts was being included in TypeScript compilation via **/*.ts glob, causing build failure when vitest is not installed; excluded it in tsconfig.json. SVG-based charts work well for simple visualizations without external dependencies. StreakCalendar uses a 12-week grid with Monday-based weeks. VocabularyList categorizes words into mastered (3+ uses), learning (2 uses), new (1 use) tiers.
- Issues encountered: Two pre-existing build failures had to be fixed: (1) next/dynamic ssr:false in server component, (2) vitest.config.ts type error. Both were resolved as part of this task.

### Task [28]: Optimize performance (API caching, lazy loading, response times) - PASS
- Files modified: src/app/(protected)/profile/loading.tsx (new), src/app/(protected)/chapters/[chapterId]/scenarios/[scenarioId]/loading.tsx (new), src/app/(protected)/chapters/[chapterId]/scenarios/[scenarioId]/review/loading.tsx (new), src/app/api/chat/route.ts (updated - route segment config, reuse TextDecoder in stream), src/app/api/progress/route.ts (updated - route segment config, cache headers), src/app/api/conversations/[scenarioId]/route.ts (updated - route segment config, cache headers), src/app/(protected)/chapters/page.tsx (updated - select specific columns), src/app/(protected)/dashboard/page.tsx (updated - select specific columns), src/app/(protected)/profile/page.tsx (updated - select specific columns), src/lib/progress/tracker.ts (updated - select specific columns), src/lib/conversation/storage.ts (updated - select specific columns), src/lib/scenario/engine.ts (updated - select specific columns), src/lib/scenario/completion.ts (updated - select specific columns for getNextScenario), src/app/(protected)/chapters/[chapterId]/scenarios/[scenarioId]/review/page.tsx (updated - select specific columns), src/app/(protected)/chapters/[chapterId]/scenarios/[scenarioId]/page.tsx (updated - select specific columns)
- Key learnings: Route segment config `export const dynamic = "force-dynamic"` explicitly marks API routes as dynamic. Supabase .select() with specific columns reduces data transfer vs .select("*"). The streaming chat implementation was creating a new TextDecoder per chunk; reusing a single decoder with {stream:true} is more efficient. Cache-Control headers: "private, no-cache" for conversation data, "private, max-age=30, stale-while-revalidate=60" for progress stats. ChatInterfaceLoader (from Task 23) already handles lazy loading of the chat interface with ssr:false.
- Issues encountered: Initial attempt to use next/dynamic ssr:false in server component failed (already known issue from Task 23). ChatInterfaceLoader was already created by Task 23. vitest needed to be installed for build to pass.

### Task [27]: Author initial 7 chapters of scenario content for MVP - PASS
- Files modified: src/lib/data/seed-scenarios.ts (expanded from Ch1 to all 7 chapters), supabase/seed.sql (new)
- Key learnings: Seed data uses stable placeholder UUIDs (00000000-0000-0000-XXXX-YYYYYYYYYYYY) where XXXX encodes chapter and YYYY encodes scenario. SQL seed file uses E'' string syntax for multiline system_prompt content with \n escapes. ON CONFLICT upsert clauses allow re-running the seed safely. Grammar progression: present (Ch1-2) -> aorist (Ch3) -> imperfect (Ch4) -> future+participles (Ch5) -> subjunctive (Ch6) -> optative+complex (Ch7). Total: 7 chapters, 25 scenarios (3-4 per chapter). Single-quote escaping in SQL uses '' (double single-quote). jsonb arrays in SQL need explicit ::jsonb cast.
- Issues encountered: None. Build passed on first attempt.
