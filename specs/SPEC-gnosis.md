# Spec: Gnosis

**Version**: 1.0
**Author**: Not specified
**Date**: 2026-01-31
**Status**: Draft

---

## 1. Executive Summary

Gnosis is an interactive web application for learning Ancient Greek (Koine/Biblical) through AI-powered conversation. Users progress through pre-authored, chapter-based scenarios -- such as buying food at a market or meeting a lost friend -- conversing with an AI agent in Ancient Greek via text and voice. The agent provides inline corrections and post-scenario reviews, adapting to the user's proficiency as they advance through the curriculum.

## 2. Problem Statement

### 2.1 The Problem

There are no interactive digital tools for learning Ancient Greek through conversation. Learners of Ancient Greek -- particularly Koine/Biblical Greek -- are limited to static textbooks, fragmented online resources, and tools designed for modern Greek. University students and theological learners have no way to practice conversational Ancient Greek in a guided, progressive format.

### 2.2 Current State

- Existing Ancient Greek resources are overwhelmingly static: textbooks, grammar references, and vocabulary lists
- Interactive language learning tools (Duolingo, Babbel, etc.) support modern Greek but not Ancient Greek
- Learners must piece together resources from multiple sources with no unified progression path
- No tools exist for practicing conversational Ancient Greek with feedback

### 2.3 Impact Analysis

Without a solution, Ancient Greek learners continue to rely on passive study methods that produce poor retention and no conversational fluency. University programs see high drop-off rates in Greek courses due to the difficulty of self-study. Theological students who need reading competency in Biblical Greek lack practical tools for developing that skill.

### 2.4 Business Value

Gnosis addresses an unserved niche in the language learning market. Ancient Greek has a dedicated learner base across universities and theological institutions worldwide. As the first interactive conversational tool for Ancient Greek, Gnosis has first-mover advantage in a market with no direct competitors.

## 3. Goals & Success Metrics

### 3.1 Primary Goals

1. Enable users to practice conversational Ancient Greek (Koine) through guided, scenario-based interactions with an AI agent
2. Provide a structured chapter-based curriculum that progressively builds proficiency
3. Deliver real-time feedback (inline corrections) and post-scenario reviews to accelerate learning

### 3.2 Success Metrics

| Metric | Current Baseline | Target | Measurement Method |
|--------|------------------|--------|--------------------|
| Registered users | 0 | 500 | Supabase auth records |
| Chapter completion rate | N/A | 60% of users complete Chapter 1 | Progress tracking data |
| Session duration | N/A | Average 15+ minutes per session | Analytics |
| Return rate | N/A | 40% weekly return rate | Auth session data |

### 3.3 Non-Goals

- Supporting modern Greek (this is exclusively for Ancient Greek)
- Replacing formal university Greek courses (this is a supplementary tool)
- Creating a social/community platform
- Supporting languages other than Ancient Greek

## 4. User Research

### 4.1 Target Users

#### Primary Persona: Sarah - Theology Student

- **Role/Description**: Graduate student studying New Testament Greek at a seminary
- **Goals**: Develop reading fluency in Koine Greek to engage with Biblical texts in the original language
- **Pain Points**: Textbook exercises feel disconnected from real language use; no way to practice conversational Greek; grammar drills are tedious without context
- **Context**: Studies evenings and weekends; uses laptop primarily; wants 15-30 minute practice sessions

#### Secondary Persona: Professor Dimitriou - Classics Instructor

- **Role/Description**: University humanities professor teaching introductory Ancient Greek courses
- **Goals**: Recommend a supplementary tool for students to practice outside of class
- **Pain Points**: Students lack practice resources; class time is insufficient for conversational practice; students lose retention between sessions

#### Tertiary Persona: Marcus - Self-Motivated Learner

- **Role/Description**: Hobbyist with interest in classical antiquity and early Christian texts
- **Goals**: Learn to read Ancient Greek at a basic conversational level
- **Pain Points**: Self-study from textbooks is isolating; no feedback on pronunciation or grammar usage; hard to stay motivated without interaction

### 4.2 User Journey Map

```
[Sign Up] --> [Select Chapter] --> [Read Scenario Context] --> [Begin Conversation]
    --> [Converse with Agent (text/voice)] --> [Receive Inline Corrections]
    --> [Agent Advances Scenario] --> [Post-Scenario Review]
    --> [View Progress Dashboard] --> [Continue to Next Scenario/Chapter]
```

A typical session: The user logs in, selects their current chapter, reads the scenario setup (e.g., "You are at a market in Corinth. Buy bread and olives from the merchant."), then engages in a back-and-forth conversation with the AI agent in Koine Greek. The agent gently corrects mistakes inline and, when the user has successfully communicated the required information, advances to the next scenario. After completing the scenario, the user sees a review of their performance.

## 5. Functional Requirements

### 5.1 Feature: User Authentication & Profiles

**Priority**: P0 (Critical)

#### User Stories

**US-001**: As a learner, I want to create an account so that my progress is saved across sessions.

**Acceptance Criteria**:
- [ ] Users can sign up with email/password
- [ ] Users can log in and log out
- [ ] User profile stores display name and current chapter progress
- [ ] Session persists across browser refreshes

**US-002**: As a learner, I want to see my overall progress so that I know how far I've come.

**Acceptance Criteria**:
- [ ] Dashboard shows chapters completed, current chapter, and scenarios within current chapter
- [ ] Dashboard shows vocabulary words encountered and accuracy trends

**Edge Cases**:
- User signs up but never starts a chapter: Dashboard shows welcome state with prompt to begin
- User clears browser data: Session is restored on login via Supabase auth

---

### 5.2 Feature: Chapter & Scenario System

**Priority**: P0 (Critical)

#### User Stories

**US-003**: As a learner, I want to progress through chapters in order so that I build skills gradually.

**Acceptance Criteria**:
- [ ] Chapters are displayed in sequential order
- [ ] Each chapter contains multiple scenarios
- [ ] Chapters have a title, description, target vocabulary list, and target grammar concepts
- [ ] Users must complete all scenarios in a chapter before unlocking the next chapter
- [ ] Scenario completion is determined by the AI agent (not a simple timer or word count)

**US-004**: As a learner, I want each scenario to present a real-world situation so that I practice practical Ancient Greek.

**Acceptance Criteria**:
- [ ] Each scenario has a context description (in English) explaining the setting and objective
- [ ] Scenarios include target phrases/vocabulary the user should attempt to use
- [ ] The AI agent plays a character role within the scenario (e.g., merchant, friend, teacher)

**Edge Cases**:
- User gets stuck and cannot progress: Provide a hint system or option to skip with reduced credit
- User wants to replay a completed scenario: Allow replay without affecting progress

---

### 5.3 Feature: Conversational AI Agent

**Priority**: P0 (Critical)

#### User Stories

**US-005**: As a learner, I want to converse with an AI agent in Koine Greek so that I practice the language interactively.

**Acceptance Criteria**:
- [ ] Agent responds in Koine Greek appropriate to the scenario context
- [ ] Agent adjusts vocabulary and grammar complexity to match the current chapter level
- [ ] Agent stays in character for the scenario role
- [ ] Agent detects when the user has communicated the required information and advances the scenario
- [ ] Conversation history is displayed in the chat interface

**US-006**: As a learner, I want the agent to correct my Greek inline so that I learn from mistakes in context.

**Acceptance Criteria**:
- [ ] Agent identifies grammatical errors, vocabulary misuse, and awkward phrasing
- [ ] Corrections are presented naturally within the conversation (not as a separate error panel)
- [ ] Corrections include a brief explanation (e.g., "The aorist tense would be more appropriate here")
- [ ] Agent does not over-correct -- focuses on errors relevant to the current chapter's grammar targets

**Edge Cases**:
- User writes in English without asking a question: Agent gently reminds them to use Greek and provides a hint
- User explicitly asks for help in English: Agent responds in English to clarify, then resumes Greek
- User writes nonsensical Greek: Agent asks for clarification in simple Greek
- User makes the same error repeatedly: Agent provides a more detailed explanation

---

### 5.4 Feature: Post-Scenario Review

**Priority**: P1 (High)

#### User Stories

**US-007**: As a learner, I want a review after each scenario so that I understand my strengths and areas for improvement.

**Acceptance Criteria**:
- [ ] Review displays after scenario completion
- [ ] Shows a summary of errors made with corrections and explanations
- [ ] Highlights new vocabulary used correctly
- [ ] Provides an overall performance indicator (e.g., accuracy percentage, fluency rating)
- [ ] Allows user to review the full conversation transcript with corrections highlighted

---

### 5.5 Feature: Voice Interaction

**Priority**: P1 (High)

#### User Stories

**US-008**: As a learner, I want to speak Ancient Greek and hear the agent respond in speech so that I develop pronunciation and listening skills.

**Acceptance Criteria**:
- [ ] Speech-to-text captures user's spoken Greek and converts it to text for the agent
- [ ] Text-to-speech renders the agent's Greek responses as audio
- [ ] Pronunciation follows Reconstructed Koine (Randall Buth's "Living Koine") phonology
- [ ] Users can toggle between voice and text modes at any time
- [ ] Voice mode shows a transcript of the conversation alongside audio controls

**Edge Cases**:
- Browser does not support Web Speech API: Fall back to text-only mode with a notification
- Background noise interferes with recognition: Provide option to type instead, show confidence indicator
- User's microphone is not available: Prompt for permission, fall back gracefully

---

### 5.6 Feature: Progress Tracking & Statistics

**Priority**: P2 (Medium)

#### User Stories

**US-009**: As a learner, I want to track my vocabulary growth and grammar accuracy over time so that I can see my improvement.

**Acceptance Criteria**:
- [ ] Track vocabulary words encountered, used correctly, and mastered
- [ ] Track grammar concepts practiced and accuracy per concept
- [ ] Display progress charts/visualizations on the dashboard
- [ ] Show streak tracking (consecutive days of practice)

## 6. Non-Functional Requirements

### 6.1 Performance

- Agent responses should return within 3 seconds for text interactions
- Voice-to-text transcription should complete within 2 seconds
- Text-to-speech audio should begin playing within 1 second of generation
- Page load time under 2 seconds on standard broadband

### 6.2 Security

- User authentication via Supabase Auth (email/password)
- API keys (Groq) stored server-side only, never exposed to the client
- All communication over HTTPS
- User data (progress, conversations) accessible only to the authenticated user
- Rate limiting on API endpoints to prevent abuse

### 6.3 Scalability

- Initial target: support up to 500 concurrent users
- Groq API usage should be monitored with per-user rate limits to manage costs
- Scenario content stored in database for easy updates without redeployment

### 6.4 Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation for all interactive elements
- Screen reader support for chat interface
- High contrast mode for Greek text readability
- Greek text rendered in a clear, readable font with appropriate sizing

### 6.5 Visual Design

- **Color palette**: White and blue as primary colors, evoking classical Mediterranean aesthetics
- **Typography**: Serif fonts (Times New Roman or similar classical serif) for body text and Greek passages; convey an ancient, scholarly feel
- **Aesthetic**: Old-world / antiquity-inspired design -- the user should feel immersed in ancient times
- **UI elements**: Classical styling cues (borders, ornamental details, parchment-like textures where appropriate)
- **Greek text**: Displayed in a serif font optimized for Greek characters with generous sizing for readability

## 7. Technical Considerations

### 7.1 Architecture Overview

Gnosis is a Next.js full-stack application. The frontend renders the chat interface, chapter navigation, and dashboard. Next.js API routes handle server-side logic including Groq API calls, conversation state management, and progress persistence. Supabase provides authentication, database (PostgreSQL), and file storage.

### 7.2 Tech Stack

- **Frontend**: Next.js (React), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **AI/LLM**: Groq API with dynamic model selection (primary candidate: `openai/gpt-oss-120b`)
- **Voice**: Web Speech API (browser-native STT), server-side or browser TTS for Greek
- **Deployment**: Vercel (recommended for Next.js)

### 7.3 Integration Points

| System | Integration Type | Purpose |
|--------|-----------------|---------|
| Groq API | REST API | LLM inference for conversational agent |
| Supabase | SDK | Auth, database, real-time subscriptions |
| Web Speech API | Browser API | Speech-to-text for voice input |
| TTS Service | API/Browser | Text-to-speech for Greek audio output |

### 7.4 Technical Constraints

- Groq API rate limits and token costs constrain conversation length per session
- Ancient Greek speech-to-text accuracy may be limited (no dedicated Ancient Greek STT models exist); may require custom handling or phonetic mapping
- Text-to-speech for Ancient Greek (reconstructed Koine pronunciation) may require a custom TTS solution or careful configuration of existing engines
- Pre-authored scenario content must be structured in a format the LLM can use as system prompts

## 8. Scope Definition

### 8.1 In Scope

- User registration, authentication, and profile management
- Chapter-based curriculum with pre-authored scenarios
- AI-powered conversational agent speaking Koine Greek
- Inline corrections and post-scenario review
- Voice input and output for Greek conversation
- Progress tracking dashboard
- Web application (desktop and mobile browsers)

### 8.2 Out of Scope

- Modern Greek support: This tool is exclusively for Ancient Greek
- Mobile native apps: Web-only for initial release
- User-generated content: Scenarios are pre-authored only
- Multiplayer/social features: No peer interaction in v1
- Offline mode: Requires internet connection for AI agent
- Classical Attic Greek dialect: Koine focus only for v1

### 8.3 Future Considerations

- Classical Attic Greek dialect support (toggle between Koine and Attic)
- Community features (forums, shared progress, leaderboards)
- Mobile native apps (React Native or similar)
- Additional scenario packs / downloadable content
- Integration with university LMS platforms
- Spaced repetition vocabulary review system

## 9. Implementation Plan

### 9.1 Phase 1: Foundation

**Completion Criteria**: User can sign up, log in, and see a chapter list. Backend can communicate with Groq API.

| Deliverable | Description | Dependencies |
|-------------|-------------|--------------|
| Next.js project setup | Initialize project with TypeScript, Tailwind CSS, ESLint | None |
| Supabase integration | Set up Supabase project, configure auth, create initial DB schema | Next.js setup |
| User auth flow | Sign up, log in, log out, protected routes | Supabase integration |
| Groq API integration | Server-side Groq client with dynamic model selection | Next.js setup |
| Chapter data model | Database schema for chapters, scenarios, and progress | Supabase integration |
| Chapter listing UI | Display available chapters with lock/unlock state | Auth flow, chapter data model |

**Checkpoint Gate**: Review database schema and Groq integration architecture before proceeding.

---

### 9.2 Phase 2: Core Conversational Experience

**Completion Criteria**: User can select a scenario, converse with the AI agent in text, receive corrections, and complete the scenario with a review.

| Deliverable | Description | Dependencies |
|-------------|-------------|--------------|
| Chat interface | Real-time chat UI with message history, typing indicators | Phase 1 |
| Scenario engine | Load scenario context, manage conversation state, detect completion | Phase 1, chapter data model |
| Agent system prompts | Pre-authored prompts per scenario defining character, context, target vocabulary/grammar | Scenario engine |
| Inline correction system | Agent identifies and corrects errors within conversation flow | Agent system prompts |
| Scenario completion logic | Agent determines when user has met scenario objectives | Scenario engine |
| Post-scenario review | Display error summary, vocabulary used, performance indicator | Scenario completion |
| Progress persistence | Save chapter/scenario completion and stats to Supabase | Supabase integration |

**Checkpoint Gate**: Test conversational quality and correction accuracy with sample scenarios before expanding content.

---

### 9.3 Phase 3: Voice Interaction

**Completion Criteria**: User can converse with the agent using voice input and hear spoken Greek responses.

| Deliverable | Description | Dependencies |
|-------------|-------------|--------------|
| Speech-to-text integration | Browser Web Speech API capture and transcription for Greek input | Phase 2 chat interface |
| Text-to-speech integration | Generate spoken Greek audio for agent responses | Phase 2 chat interface |
| Voice mode UI | Toggle between text/voice, audio controls, live transcript | STT + TTS integration |
| Pronunciation handling | Configure TTS for Reconstructed Koine (Buth) pronunciation | TTS integration |
| Fallback handling | Graceful degradation when voice APIs are unavailable | Voice mode UI |

**Checkpoint Gate**: Evaluate Greek STT accuracy and TTS pronunciation quality; decide whether custom solutions are needed.

---

### 9.4 Phase 4: Polish & Dashboard

**Completion Criteria**: Progress dashboard is functional, UX is refined, and the app is ready for initial users.

| Deliverable | Description | Dependencies |
|-------------|-------------|--------------|
| Progress dashboard | Charts for vocabulary growth, grammar accuracy, streaks | Phase 2 progress persistence |
| Hint system | Allow users to request hints when stuck in a scenario | Phase 2 scenario engine |
| Scenario replay | Allow users to replay completed scenarios | Phase 2 scenario completion |
| UX polish | Loading states, animations, error handling, responsive design | All phases |
| Content authoring | Write initial set of 7 chapters with scenarios for MVP | Phase 2 agent system prompts |
| Performance optimization | Optimize API calls, caching, lazy loading | All phases |

## 10. Dependencies

### 10.1 Technical Dependencies

| Dependency | Status | Risk if Delayed |
|------------|--------|-----------------|
| Groq API access | Available | High - core functionality blocked |
| Supabase project | Available | High - auth and data storage blocked |
| Web Speech API browser support | Available (Chrome, Edge) | Medium - voice features limited in some browsers |
| Ancient Greek TTS capability | Needs research | Medium - voice output quality may be limited |

### 10.2 Content Dependencies

| Dependency | Status | Risk if Delayed |
|------------|--------|-----------------|
| Koine Greek scenario scripts | Not started | High - no content to practice with |
| Grammar progression curriculum | Not started | High - chapter structure undefined |
| Vocabulary lists per chapter | Not started | Medium - agent can still function without explicit lists |

## 11. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation Strategy |
|------|--------|------------|---------------------|
| LLM produces inaccurate Ancient Greek | High | Medium | Extensive prompt engineering; include grammar rules and vocabulary constraints in system prompts; human review of sample conversations |
| Ancient Greek STT does not exist | High | High | Use general Greek STT with phonetic mapping; accept text input as primary mode; voice as enhancement |
| TTS pronunciation is inaccurate for Koine | Medium | High | Research custom TTS options; provide phonetic guides alongside audio; allow community pronunciation feedback |
| Groq API costs exceed budget | Medium | Medium | Implement per-user rate limits; optimize prompt length; cache common agent responses |
| Pre-authored content takes too long to create | High | Medium | Start with 3 chapters minimum; use AI-assisted content generation with expert review |
| Users find AI corrections unreliable | High | Medium | Include confidence indicators; allow users to flag incorrect corrections; iterate on prompt engineering |

## 12. Open Questions

| # | Question | Resolution |
|---|----------|------------|
| 1 | What reconstructed Koine pronunciation standard should be used for TTS? | **Resolved**: Reconstructed Koine (Randall Buth's "Living Koine") -- based on Modern Greek but un-iotacized per historical manuscript evidence. Best fit for a conversational app. |
| 2 | Should the agent ever respond in English, or strictly Greek with Greek explanations? | **Resolved**: Agent responds only in Greek unless the user explicitly asks for English (e.g., they are lost or have a clarifying question). |
| 3 | How many chapters/scenarios are needed for a viable MVP launch? | **Resolved**: 7 chapters for MVP. |
| 4 | Should there be a free tier and paid tier, or is the app free initially? | **Resolved**: Free for all users initially. Monetization deferred to a future version. |
| 5 | What Groq model performs best for Ancient Greek generation? Needs benchmarking. | **Partially resolved**: Primary candidate is `openai/gpt-oss-120b` ($0.15/$0.60 per 1M tokens, 500 T/sec, 131K context). Benchmarking against actual Greek output quality still needed before finalizing. |
| 6 | Is there an existing Ancient Greek corpus that can be used for prompt grounding? | **Deferred**: Koine Greek Bible text exists online and could be used for grounding, but the ROI of acquiring and integrating corpus data needs evaluation before investing effort. Not blocking for MVP. |

## 13. Appendix

### 13.1 Glossary

| Term | Definition |
|------|------------|
| Koine Greek | The common dialect of Greek spoken from approximately 300 BCE to 300 CE, the language of the New Testament and Septuagint |
| Scenario | A single conversational exercise within a chapter, set in a specific real-world context |
| Chapter | A group of related scenarios targeting specific vocabulary and grammar concepts |
| Inline correction | A grammar or vocabulary correction delivered naturally within the conversation flow |
| Post-scenario review | A summary of performance, errors, and vocabulary shown after completing a scenario |
| STT | Speech-to-text: converting spoken audio to written text |
| TTS | Text-to-speech: converting written text to spoken audio |
| Groq | AI inference platform providing fast LLM API access with multiple model options |

### 13.2 References

- Reconstructed Koine Greek Pronunciation (Randall Buth "Living Koine" methodology) -- [Biblical Language Center](https://www.biblicallanguagecenter.com/koine-greek-pronunciation/)
- Mark Jeong, *A Greek Reader: Companion to A Primer of Biblical Greek* (Eerdmans, 2022) -- pedagogical reference
- Supabase documentation
- Groq API documentation
- Web Speech API (MDN)
- Next.js documentation

---

*Document generated by SDD Tools*
