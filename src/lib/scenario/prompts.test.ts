import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  buildFallbackSystemPrompt,
  type ScenarioPromptData,
} from "./prompts";
import type { Chapter, Scenario } from "@/types/database";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeChapter(overrides?: Partial<Chapter>): Chapter {
  return {
    id: "ch-001",
    chapter_number: 1,
    title: "Greetings and the Marketplace",
    description: "Learn basic greetings in Koine Greek",
    target_vocabulary: ["agora", "artos", "chaire"],
    target_grammar: ["nominative case", "present tense"],
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeScenario(overrides?: Partial<Scenario>): Scenario {
  return {
    id: "sc-001",
    chapter_id: "ch-001",
    scenario_number: 1,
    title: "Meeting the Merchant",
    context_description: "You are at the agora in ancient Athens.",
    agent_role: "A friendly merchant selling bread and olives.",
    target_phrases: ["Chaire!", "Ti poleis?"],
    system_prompt: "You are Nikolaos, a bread merchant at the agora.",
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

describe("buildSystemPrompt", () => {
  it("produces a non-empty string", () => {
    const data: ScenarioPromptData = {
      scenario: makeScenario(),
      chapter: makeChapter(),
    };
    const prompt = buildSystemPrompt(data);
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("includes the base system prompt instructions", () => {
    const prompt = buildSystemPrompt({
      scenario: makeScenario(),
      chapter: makeChapter(),
    });
    expect(prompt).toContain("Koine Greek");
    expect(prompt).toContain("Buth");
    expect(prompt).toContain("Living Koine");
  });

  it("includes the chapter number and level", () => {
    const prompt = buildSystemPrompt({
      scenario: makeScenario(),
      chapter: makeChapter({ chapter_number: 1 }),
    });
    expect(prompt).toContain("Chapter 1");
    expect(prompt).toContain("Beginner");
  });

  it("includes the scenario context section", () => {
    const prompt = buildSystemPrompt({
      scenario: makeScenario(),
      chapter: makeChapter(),
    });
    expect(prompt).toContain("Scenario Context");
    expect(prompt).toContain("Meeting the Merchant");
    expect(prompt).toContain("agora in ancient Athens");
    expect(prompt).toContain("friendly merchant");
  });

  it("includes the learning targets section", () => {
    const prompt = buildSystemPrompt({
      scenario: makeScenario(),
      chapter: makeChapter(),
    });
    expect(prompt).toContain("Learning Targets");
    expect(prompt).toContain("agora");
    expect(prompt).toContain("nominative case");
    expect(prompt).toContain("Chaire!");
  });

  it("includes the scenario-specific preamble", () => {
    const prompt = buildSystemPrompt({
      scenario: makeScenario(),
      chapter: makeChapter(),
    });
    expect(prompt).toContain("Nikolaos");
  });

  it("includes scenario completion marker instructions", () => {
    const prompt = buildSystemPrompt({
      scenario: makeScenario(),
      chapter: makeChapter(),
    });
    expect(prompt).toContain("[SCENARIO_COMPLETE]");
  });

  it("includes inline correction instructions", () => {
    const prompt = buildSystemPrompt({
      scenario: makeScenario(),
      chapter: makeChapter(),
    });
    expect(prompt).toContain("Inline Corrections");
  });

  it("adjusts level description based on chapter number", () => {
    const beginner = buildSystemPrompt({
      scenario: makeScenario(),
      chapter: makeChapter({ chapter_number: 1 }),
    });
    expect(beginner).toContain("Beginner");

    const elementary = buildSystemPrompt({
      scenario: makeScenario(),
      chapter: makeChapter({ chapter_number: 3 }),
    });
    expect(elementary).toContain("Elementary");

    const intermediate = buildSystemPrompt({
      scenario: makeScenario(),
      chapter: makeChapter({ chapter_number: 5 }),
    });
    expect(intermediate).toContain("Intermediate");

    const upper = buildSystemPrompt({
      scenario: makeScenario(),
      chapter: makeChapter({ chapter_number: 7 }),
    });
    expect(upper).toContain("Upper Intermediate");
  });

  it("includes horizontal rule separators", () => {
    const prompt = buildSystemPrompt({
      scenario: makeScenario(),
      chapter: makeChapter(),
    });
    expect(prompt).toContain("---");
  });

  it("handles empty target arrays gracefully", () => {
    const prompt = buildSystemPrompt({
      scenario: makeScenario({ target_phrases: [] }),
      chapter: makeChapter({ target_vocabulary: [], target_grammar: [] }),
    });
    expect(prompt).toContain("No specific vocabulary targets");
    expect(prompt).toContain("No specific grammar targets");
    expect(prompt).toContain("No specific target phrases");
  });
});

// ---------------------------------------------------------------------------
// buildFallbackSystemPrompt
// ---------------------------------------------------------------------------

describe("buildFallbackSystemPrompt", () => {
  it("produces a non-empty string", () => {
    const prompt = buildFallbackSystemPrompt();
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("mentions Koine Greek", () => {
    const prompt = buildFallbackSystemPrompt();
    expect(prompt).toContain("Koine Greek");
  });

  it("mentions Buth Living Koine pronunciation", () => {
    const prompt = buildFallbackSystemPrompt();
    expect(prompt).toContain("Buth");
    expect(prompt).toContain("Living Koine");
  });

  it("instructs to respond in Koine Greek", () => {
    const prompt = buildFallbackSystemPrompt();
    expect(prompt).toContain("Respond primarily in Koine Greek");
  });
});
