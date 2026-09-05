export type Member = {
  id: string;
  name: string;
  status: "active" | "inactive";
  packageEndsOn: string;
  remainingLessons: number;
};
export type Lesson = {
  id: string;
  memberId: string;
  startsAt: string;
  status: "scheduled" | "completed" | "cancelled";
};
export type Dataset = { asOf: string; members: Member[]; lessons: Lesson[] };
export type ToolResult = { ok: boolean; data?: unknown; sources?: string[]; error?: string };
export type ToolDefinition = {
  type: "function";
  name: string;
  description: string;
  strict: true;
  parameters: Record<string, unknown>;
};
export type ToolCall = { type: "function_call"; call_id: string; name: string; arguments: string };
export type ModelItem = { type: string; [key: string]: unknown };
export type ModelResponse = {
  output: ModelItem[];
  usage?: { input_tokens?: number; output_tokens?: number };
};
export type ModelRequest = { instructions: string; input: ModelItem[]; tools: ToolDefinition[] };
export interface ModelProvider {
  respond(request: ModelRequest): Promise<ModelResponse>;
}
export type ToolRegistry = {
  definitions: ToolDefinition[];
  execute(name: string, args: unknown): ToolResult;
};
export type EvidenceFact = { text: string; sourceIds: string[] };
export type DraftAction = {
  kind: "renewal_follow_up" | "schedule_follow_up";
  memberId: string;
  reason: string;
  sourceIds: string[];
};
export type CopilotAnswer = {
  summary: string;
  facts: EvidenceFact[];
  drafts: DraftAction[];
  limitations: string[];
};
export type TraceEvent = {
  step: number;
  tool: string;
  ok: boolean;
  durationMs: number;
  sources: string[];
  error?: string;
};
export type CopilotResult = {
  answer: CopilotAnswer;
  trace: TraceEvent[];
  usage: { inputTokens: number; outputTokens: number };
  modelCalls: number;
  durationMs: number;
  mode: "demo" | "live";
};
