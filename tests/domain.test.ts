import assert from "node:assert/strict";
import { test } from "node:test";
import { loadDataset, validateDataset } from "../src/domain.ts";
import { createToolRegistry } from "../src/tools.ts";
import type { Dataset, Lesson, Member, ToolResult } from "../src/types.ts";

const demo = await loadDataset();
function data(result: ToolResult): { asOf: string; members?: Member[]; member?: Member; lessons?: Lesson[] } {
  assert.equal(result.ok, true, result.error);
  return result.data as ReturnType<typeof data>;
}

test("synthetic fixture is deterministic and expiry window includes both boundary dates", () => {
  assert.equal(demo.asOf, "2026-09-05");
  assert.equal(demo.members.length, 6);
  assert.equal(demo.lessons.length, 5);
  const registry = createToolRegistry(demo);
  const today = registry.execute("list_expiring_memberships", { withinDays: 0 });
  assert.deepEqual(data(today).members?.map((member) => member.id), ["M001"]);
  const week = registry.execute("list_expiring_memberships", { withinDays: 7 });
  assert.deepEqual(data(week).members?.map((member) => member.id), ["M001", "M002", "M003"]);
  assert.deepEqual(week.sources, ["snapshot:2026-09-05", "member:M001", "member:M002", "member:M003"]);
  assert.deepEqual(data(registry.execute("list_expiring_memberships", { withinDays: 30 })).members?.map((member) => member.id), ["M001", "M002", "M003", "M005"]);
});

test("upcoming lessons include the full final UTC day, excluding cancelled and completed", () => {
  const registry = createToolRegistry(demo);
  const result = registry.execute("list_upcoming_lessons", { withinDays: 7 });
  assert.deepEqual(data(result).lessons?.map((lesson) => lesson.id), ["L001", "L002", "L003"]);
  assert.deepEqual(result.sources, ["snapshot:2026-09-05", "lesson:L001", "lesson:L002", "lesson:L003"]);
  assert.deepEqual(data(registry.execute("list_upcoming_lessons", { withinDays: 0 })).lessons?.map((lesson) => lesson.id), ["L001"]);
});

test("UTC windows cross leap-day and year boundaries without using the wall clock", () => {
  for (const [asOf, inside, outside] of [["2028-02-28", "2028-02-29", "2028-03-01"], ["2026-12-31", "2027-01-01", "2027-01-02"]]) {
    const dataset: Dataset = {
      asOf, members: [
        { ...demo.members[0], id: "inside", packageEndsOn: inside },
        { ...demo.members[0], id: "outside", packageEndsOn: outside },
      ], lessons: [
        { id: "start", memberId: "inside", startsAt: `${asOf}T00:00:00Z`, status: "scheduled" },
        { id: "end", memberId: "inside", startsAt: `${inside}T23:59:59.999Z`, status: "scheduled" },
        { id: "outside", memberId: "outside", startsAt: `${outside}T00:00:00Z`, status: "scheduled" },
      ],
    };
    const registry = createToolRegistry(dataset);
    assert.deepEqual(data(registry.execute("list_expiring_memberships", { withinDays: 1 })).members?.map((member) => member.id), ["inside"]);
    assert.deepEqual(data(registry.execute("list_upcoming_lessons", { withinDays: 1 })).lessons?.map((lesson) => lesson.id), ["start", "end"]);
  }
});

test("member context preserves cancelled history and rejects unknown members", () => {
  const registry = createToolRegistry(demo);
  const context = registry.execute("get_member_context", { memberId: "M002" });
  assert.equal(data(context).member?.id, "M002");
  assert.deepEqual(data(context).lessons?.map((lesson) => lesson.id), ["L004", "L002"]);
  assert.deepEqual(context.sources, ["snapshot:2026-09-05", "member:M002", "lesson:L004", "lesson:L002"]);
  assert.equal(registry.execute("get_member_context", { memberId: "missing" }).ok, false);
});

test("tool schemas and runtime both reject unknown fields and invalid argument types", () => {
  const registry = createToolRegistry(demo);
  for (const definition of registry.definitions) {
    assert.equal(definition.strict, true);
    assert.equal(definition.parameters.additionalProperties, false);
  }
  for (const name of ["list_expiring_memberships", "list_upcoming_lessons"]) {
    for (const args of [null, [], {}, { withinDays: -1 }, { withinDays: 31 }, { withinDays: 1.5 }, { withinDays: "7" }, { withinDays: NaN }, { withinDays: Infinity }, { withinDays: 7, send: true }]) {
      assert.equal(registry.execute(name, args).ok, false, `${name} accepted ${JSON.stringify(args)}`);
    }
  }
  for (const args of [null, [], {}, { memberId: 1 }, { memberId: "" }, { memberId: " " }, { memberId: "M001", send: true }]) {
    assert.equal(registry.execute("get_member_context", args).ok, false);
  }
  assert.deepEqual(registry.execute("send_email", {}), { ok: false, error: "Unknown tool: send_email." });
});

test("execution never mutates its input and results cannot alter later tool calls", () => {
  const dataset = structuredClone(demo);
  const original = structuredClone(dataset);
  for (const member of dataset.members) Object.freeze(member);
  for (const lesson of dataset.lessons) Object.freeze(lesson);
  Object.freeze(dataset.members);
  Object.freeze(dataset.lessons);
  Object.freeze(dataset);
  const registry = createToolRegistry(dataset);
  const result = data(registry.execute("get_member_context", { memberId: "M002" }));
  result.member!.name = "Altered output";
  result.lessons![0].status = "scheduled";
  const second = data(registry.execute("get_member_context", { memberId: "M002" }));
  assert.equal(second.member!.name, "Demo Deniz");
  assert.equal(second.lessons![0].status, "cancelled");
  assert.deepEqual(dataset, original);

  const mutable = structuredClone(demo);
  const isolated = createToolRegistry(mutable);
  mutable.members[0].name = "Changed source after registry creation";
  assert.equal(data(isolated.execute("get_member_context", { memberId: "M001" })).member?.name, "Demo Ada");
});

test("empty windows return snapshot evidence instead of inventing matches", () => {
  const dataset: Dataset = { asOf: demo.asOf, members: [], lessons: [] };
  const registry = createToolRegistry(dataset);
  const result = registry.execute("list_upcoming_lessons", { withinDays: 7 });
  assert.deepEqual(data(result).lessons, []);
  assert.deepEqual(result.sources, ["snapshot:2026-09-05"]);
});

test("dataset boundary rejects malformed dates, duplicate IDs, broken references and invalid values", () => {
  const invalidChanges: ((dataset: Dataset) => void)[] = [
    (value) => { value.asOf = "2026-02-29"; },
    (value) => { value.asOf = "2026-9-05"; },
    (value) => { value.members[0].packageEndsOn = "2026-09-31"; },
    (value) => { value.lessons[0].startsAt = "2026-02-30T10:00:00Z"; },
    (value) => { value.lessons[0].startsAt = "2026-09-05T24:00:00Z"; },
    (value) => { value.lessons[0].startsAt = "2026-09-05T10:00:00"; },
    (value) => { value.members[1].id = value.members[0].id; },
    (value) => { value.lessons[1].id = value.lessons[0].id; },
    (value) => { value.lessons[0].memberId = "unknown"; },
    (value) => { value.members[0].remainingLessons = -1; },
    (value) => { value.members[0].remainingLessons = 1.5; },
    (value) => { value.members[0].name = " "; },
    (value) => { value.members[0].id = "member:collision"; },
    (value) => { (value.members[0] as unknown as Record<string, unknown>).status = "enabled"; },
    (value) => { (value.lessons[0] as unknown as Record<string, unknown>).status = "pending"; },
    (value) => { (value as unknown as Record<string, unknown>).secret = true; },
  ];
  for (const change of invalidChanges) {
    const invalid = structuredClone(demo);
    change(invalid);
    assert.throws(() => validateDataset(invalid));
  }
  for (const invalid of [null, [], {}, { ...demo, lessons: null }]) assert.throws(() => validateDataset(invalid));
  assert.equal(validateDataset({ ...demo, asOf: "2028-02-29" }).asOf, "2028-02-29");
});
