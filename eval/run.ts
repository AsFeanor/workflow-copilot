import { loadDataset } from "../src/domain.ts";
import { createToolRegistry } from "../src/tools.ts";
import { runCopilot } from "../src/copilot.ts";
import { createDemoProvider, DEMO_QUESTION } from "../src/demo.ts";
import type { ModelProvider } from "../src/types.ts";

// Contract scenarios exercise real orchestration using scripted providers.
// They are deliberately not presented as measurements of LLM answer quality.
const dataset = await loadDataset(),
  registry = createToolRegistry(dataset);
const cases: { name: string; run: () => Promise<boolean> | boolean }[] = [
  {
    name: "No write capability is exposed",
    run: () =>
      registry.definitions.every(
        (t) => t.name.startsWith("list_") || t.name === "get_member_context",
      ),
  },
  {
    name: "Unknown write requests are rejected",
    run: () => !registry.execute("renew_membership", { memberId: "M001" }).ok,
  },
  {
    name: "Invalid time windows are rejected",
    run: () =>
      !registry.execute("list_expiring_memberships", { withinDays: -1 }).ok &&
      !registry.execute("list_expiring_memberships", { withinDays: 1000 }).ok,
  },
  {
    name: "Demo produces observed evidence and draft-only actions",
    run: async () => {
      const result = await runCopilot(DEMO_QUESTION, createDemoProvider(), registry, {
        mode: "demo",
      });
      const sources = new Set(result.trace.flatMap((t) => t.sources));
      return (
        result.answer.facts.length > 0 &&
        result.answer.facts.every((f) => f.sourceIds.every((id) => sources.has(id))) &&
        result.answer.drafts.every((d) => d.sourceIds.includes(`member:${d.memberId}`))
      );
    },
  },
  {
    name: "Fabricated record references are rejected",
    run: async () => {
      const provider: ModelProvider = {
        async respond() {
          return {
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      summary: "Unsupported answer",
                      facts: [{ text: "Invented member", sourceIds: ["member:NOT_OBSERVED"] }],
                      drafts: [],
                      limitations: [],
                    }),
                  },
                ],
              },
            ],
          };
        },
      };
      try {
        await runCopilot("Find a member", provider, registry);
        return false;
      } catch (error) {
        return error instanceof Error && error.message.includes("unobserved");
      }
    },
  },
  {
    name: "Repeated requests cannot create an infinite loop",
    run: async () => {
      let n = 0;
      const provider: ModelProvider = {
        async respond() {
          return {
            output: [
              {
                type: "function_call",
                call_id: `loop-${++n}`,
                name: "list_expiring_memberships",
                arguments: '{"withinDays":7}',
              },
            ],
          };
        },
      };
      try {
        await runCopilot("Find members", provider, registry, { maxModelCalls: 2 });
        return false;
      } catch (error) {
        return error instanceof Error && error.message.includes("budget");
      }
    },
  },
];
let passed = 0;
console.log("DETERMINISTIC CONTRACT EVALS — no language model is scored\n");
for (const item of cases) {
  let ok = false;
  try {
    ok = await item.run();
  } catch {}
  console.log(`${ok ? "PASS" : "FAIL"} ${item.name}`);
  if (ok) passed++;
}
console.log(`\n${passed}/${cases.length} contract scenarios passed.`);
if (passed !== cases.length) process.exitCode = 1;
