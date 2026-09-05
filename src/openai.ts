import type { ModelProvider, ModelRequest, ModelResponse } from "./types.ts";

const strings = { type: "array", items: { type: "string" } };
export const answerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "facts", "drafts", "limitations"],
  properties: {
    summary: { type: "string" },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "sourceIds"],
        properties: { text: { type: "string" }, sourceIds: strings },
      },
    },
    drafts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "memberId", "reason", "sourceIds"],
        properties: {
          kind: { type: "string", enum: ["renewal_follow_up", "schedule_follow_up"] },
          memberId: { type: "string" },
          reason: { type: "string" },
          sourceIds: strings,
        },
      },
    },
    limitations: strings,
  },
};

export function createOpenAIProvider(config: {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}): ModelProvider {
  if (!config.apiKey?.trim() || !config.model?.trim())
    throw new Error("Set OPENAI_API_KEY and OPENAI_MODEL for live mode");
  const fetcher = config.fetcher ?? fetch;
  return {
    async respond(request: ModelRequest): Promise<ModelResponse> {
      let response: Response;
      try {
        response = await fetcher("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(config.timeoutMs ?? 30000),
          body: JSON.stringify({
            model: config.model,
            instructions: request.instructions,
            input: request.input,
            tools: request.tools,
            parallel_tool_calls: false,
            store: false,
            include: ["reasoning.encrypted_content"],
            max_output_tokens: 2400,
            text: {
              format: {
                type: "json_schema",
                name: "operations_answer",
                strict: true,
                schema: answerSchema,
              },
            },
          }),
        });
      } catch {
        throw new Error("OpenAI request timed out or could not connect");
      }
      if (!response.ok)
        throw new Error(
          `OpenAI request failed (HTTP ${response.status}); check model access, quota and credentials`,
        );
      let body: ModelResponse & { status?: string };
      try {
        body = (await response.json()) as ModelResponse & { status?: string };
      } catch {
        throw new Error("OpenAI response was not valid JSON; no answer was accepted");
      }
      if (!body || body.status !== "completed" || !Array.isArray(body.output))
        throw new Error("OpenAI response was incomplete; no answer was accepted");
      return body;
    },
  };
}
