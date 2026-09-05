import { validateDataset } from "./domain.ts";
import type { Dataset, ToolDefinition, ToolResult } from "./types.ts";

const DAY_MS = 86_400_000;
const windowSchema = {
  type: "object",
  properties: { withinDays: { type: "integer", minimum: 0, maximum: 30 } },
  required: ["withinDays"],
  additionalProperties: false,
};

function argsObject(args: unknown, key: string): Record<string, unknown> | undefined {
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  const keys = Object.keys(args);
  if (keys.length !== 1 || keys[0] !== key) return undefined;
  return args as Record<string, unknown>;
}

/** Read-only tools against an isolated, validated snapshot. No IO occurs during execution. */
export function createToolRegistry(dataset: Dataset): {
  definitions: ToolDefinition[];
  execute(name: string, args: unknown): ToolResult;
} {
  const snapshot = validateDataset(dataset);
  const start = Date.parse(`${snapshot.asOf}T00:00:00.000Z`);
  const snapshotSource = `snapshot:${snapshot.asOf}`;
  const definitions: ToolDefinition[] = [
    {
      type: "function",
      name: "list_expiring_memberships",
      strict: true,
      description:
        "List active memberships ending from the snapshot UTC date through withinDays days later, inclusive. Excludes already expired and inactive memberships. withinDays=0 means the snapshot date only.",
      parameters: structuredClone(windowSchema),
    },
    {
      type: "function",
      name: "get_member_context",
      strict: true,
      description:
        "Read one member and all their lessons, including historical, completed and cancelled lessons. A read-only snapshot; does not contact anyone.",
      parameters: {
        type: "object",
        properties: { memberId: { type: "string", minLength: 1 } },
        required: ["memberId"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "list_upcoming_lessons",
      strict: true,
      description:
        "List scheduled lessons from the start of the snapshot UTC date through the end of the date withinDays days later, inclusive. Excludes cancelled and completed lessons. withinDays=0 means the snapshot date only.",
      parameters: structuredClone(windowSchema),
    },
  ];

  function execute(name: string, args: unknown): ToolResult {
    if (name === "get_member_context") {
      const input = argsObject(args, "memberId");
      if (!input || typeof input.memberId !== "string" || !input.memberId.trim()) {
        return {
          ok: false,
          error: "Invalid arguments: expected exactly {memberId: nonempty string}.",
        };
      }
      const member = snapshot.members.find((item) => item.id === input.memberId);
      if (!member) return { ok: false, error: `Unknown member: ${input.memberId}.` };
      const lessons = snapshot.lessons
        .filter((item) => item.memberId === member.id)
        .sort(
          (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id),
        );
      return {
        ok: true,
        data: structuredClone({ asOf: snapshot.asOf, member, lessons }),
        sources: [
          snapshotSource,
          `member:${member.id}`,
          ...lessons.map((item) => `lesson:${item.id}`),
        ],
      };
    }
    if (name !== "list_expiring_memberships" && name !== "list_upcoming_lessons") {
      return { ok: false, error: `Unknown tool: ${name}.` };
    }
    const input = argsObject(args, "withinDays");
    if (
      !input ||
      !Number.isInteger(input.withinDays) ||
      (input.withinDays as number) < 0 ||
      (input.withinDays as number) > 30
    ) {
      return {
        ok: false,
        error: "Invalid arguments: expected exactly {withinDays: integer from 0 to 30}.",
      };
    }
    const withinDays = input.withinDays as number;
    const endExclusive = start + (withinDays + 1) * DAY_MS;
    if (name === "list_expiring_memberships") {
      const members = snapshot.members
        .filter((item) => {
          const ends = Date.parse(`${item.packageEndsOn}T00:00:00.000Z`);
          return item.status === "active" && ends >= start && ends < endExclusive;
        })
        .sort((a, b) => a.packageEndsOn.localeCompare(b.packageEndsOn) || a.id.localeCompare(b.id));
      return {
        ok: true,
        data: structuredClone({ asOf: snapshot.asOf, withinDays, members }),
        sources: [snapshotSource, ...members.map((item) => `member:${item.id}`)],
      };
    }
    const lessons = snapshot.lessons
      .filter((item) => {
        const starts = Date.parse(item.startsAt);
        return item.status === "scheduled" && starts >= start && starts < endExclusive;
      })
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id));
    return {
      ok: true,
      data: structuredClone({ asOf: snapshot.asOf, withinDays, lessons }),
      sources: [snapshotSource, ...lessons.map((item) => `lesson:${item.id}`)],
    };
  }
  return { definitions, execute };
}
