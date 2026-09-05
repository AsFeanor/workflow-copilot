import type { CopilotAnswer, Member, ModelProvider, ToolResult } from "./types.ts";

export const DEMO_QUESTION =
  "Which active memberships expire within the next seven days? Prepare follow-up proposals with record references.";

// This is a scripted provider for a reproducible example, not an offline language model.
export function createDemoProvider(): ModelProvider {
  return {
    async respond(request) {
      const output = request.input.findLast((item) => item.type === "function_call_output");
      if (!output)
        return {
          output: [
            {
              type: "function_call",
              call_id: "demo_expiring",
              name: "list_expiring_memberships",
              arguments: JSON.stringify({ withinDays: 7 }),
            },
          ],
        };
      const result = JSON.parse(String(output.output)) as ToolResult;
      if (!result.ok)
        return {
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    summary: "The snapshot could not be read.",
                    facts: [],
                    drafts: [],
                    limitations: ["No recommendation was produced because the read tool failed."],
                  }),
                },
              ],
            },
          ],
        };
      const data = result.data as { asOf: string; members: Member[] };
      const facts = data.members.map((member) => ({
        text: `${member.name} has an active package ending on ${member.packageEndsOn}, with ${member.remainingLessons} ${member.remainingLessons === 1 ? "lesson" : "lessons"} remaining.`,
        sourceIds: [`member:${member.id}`],
      }));
      if (!facts.length)
        facts.push({
          text: "No active memberships expire in the requested window.",
          sourceIds: [`snapshot:${data.asOf}`],
        });
      const answer: CopilotAnswer = {
        summary: `${data.members.length} active memberships expire within seven days of ${data.asOf}.`,
        facts,
        drafts: data.members.map((member) => ({
          kind: "renewal_follow_up",
          memberId: member.id,
          reason: `Review renewal options before ${member.packageEndsOn}.`,
          sourceIds: [`member:${member.id}`],
        })),
        limitations: [
          "Fictional, fixed-date demo data. These are proposals only; no messages were sent and no records were changed.",
          "The demo uses a scripted provider. It does not measure language-model quality.",
        ],
      };
      return {
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: JSON.stringify(answer) }],
          },
        ],
      };
    },
  };
}
