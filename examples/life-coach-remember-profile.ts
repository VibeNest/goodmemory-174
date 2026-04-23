import { createGoodMemory, rememberRules } from "../src";

const memory = createGoodMemory({
  storage: { provider: "memory" },
  remember: {
    profiles: [
      {
        id: "life-coach",
        when: { agentId: "life-coach" },
        rules: [
          rememberRules.fact(/my top priority this quarter is (.+)/i, {
            id: "life-goal-priority",
            category: "goal",
            tags: ["life_coach", "long_term_goal"],
            attributes: { horizon: "quarter" },
            content: ({ match }) => match[1] ?? "",
          }),
          rememberRules.preference(/please coach me with (.+)/i, {
            id: "life-coaching-style",
            category: "coaching_style",
            tags: ["life_coach", "style"],
            value: ({ match }) => match[1] ?? "",
          }),
          rememberRules.fact(/my sister and i (.+)/i, {
            id: "life-relationship-context",
            category: "relationship_dynamic",
            tags: ["life_coach", "relationship"],
            content: ({ message }) => message.content,
          }),
        ],
        assistantOutputs: { mode: "confirmed_or_verified_only" },
      },
    ],
  },
});

const scope = {
  agentId: "life-coach",
  userId: "user-life-coach-demo",
};

await memory.remember({
  extractionStrategy: "rules-only",
  messages: [
    {
      role: "user",
      content: "My top priority this quarter is rebuilding my sleep routine.",
    },
    {
      role: "user",
      content: "Please coach me with concise weekly planning prompts.",
    },
    {
      role: "user",
      content: "My sister and I are rebuilding trust after the move.",
    },
  ],
  scope,
});

await memory.remember({
  annotations: [
    {
      confirmed: true,
      kindHint: "fact",
      messageIndex: 0,
      metadataPatch: {
        attributes: { cadence: "weekly" },
        category: "habit",
        tags: ["life_coach", "weekly_review"],
      },
      remember: "always",
    },
  ],
  messages: [
    {
      role: "assistant",
      content: "A weekly review cadence may help.",
    },
  ],
  scope,
});

const exported = await memory.exportMemory({ scope });

console.log(JSON.stringify({
  facts: exported.durable.facts.map((fact) => ({
    attributes: fact.attributes,
    category: fact.category,
    content: fact.content,
    tags: fact.tags,
  })),
  preferences: exported.durable.preferences.map((preference) => ({
    attributes: preference.attributes,
    category: preference.category,
    tags: preference.tags,
    value: preference.value,
  })),
}, null, 2));
