import { readFile } from "node:fs/promises";
import type { Dataset, Lesson, Member } from "./types.ts";

function record(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const object = value as Record<string, unknown>;
  if (
    Object.keys(object).some((key) => !keys.includes(key)) ||
    keys.some((key) => !(key in object))
  ) {
    throw new Error(`${label} has missing or unknown fields`);
  }
  return object;
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`${label} must be a nonempty string`);
  return value;
}

function date(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be an ISO date (YYYY-MM-DD)`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid calendar date`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  ) {
    throw new Error(`${label} must be an ISO timestamp in UTC ending in Z`);
  }
  date(value.slice(0, 10), label);
  const [hour, minute, second] = value.slice(11, 19).split(":").map(Number);
  if (hour > 23 || minute > 59 || second > 59 || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid UTC timestamp`);
  }
  return value;
}

/** Validate and copy at the boundary; tool results never share mutable source objects. */
export function validateDataset(value: unknown): Dataset {
  const root = record(value, ["asOf", "members", "lessons"], "dataset");
  const asOf = date(root.asOf, "asOf");
  if (!Array.isArray(root.members) || !Array.isArray(root.lessons)) {
    throw new Error("members and lessons must be arrays");
  }
  const memberIds = new Set<string>();
  const members = root.members.map((value, index): Member => {
    const label = `members[${index}]`;
    const item = record(
      value,
      ["id", "name", "status", "packageEndsOn", "remainingLessons"],
      label,
    );
    const id = nonempty(item.id, `${label}.id`);
    if (!/^[A-Za-z0-9_-]+$/.test(id) || memberIds.has(id))
      throw new Error(`${label}.id must be unique and contain only letters, numbers, _ or -`);
    memberIds.add(id);
    if (item.status !== "active" && item.status !== "inactive")
      throw new Error(`${label}.status is invalid`);
    if (!Number.isSafeInteger(item.remainingLessons) || (item.remainingLessons as number) < 0) {
      throw new Error(`${label}.remainingLessons must be a nonnegative integer`);
    }
    return {
      id,
      name: nonempty(item.name, `${label}.name`),
      status: item.status,
      packageEndsOn: date(item.packageEndsOn, `${label}.packageEndsOn`),
      remainingLessons: item.remainingLessons as number,
    };
  });
  const lessonIds = new Set<string>();
  const lessons = root.lessons.map((value, index): Lesson => {
    const label = `lessons[${index}]`;
    const item = record(value, ["id", "memberId", "startsAt", "status"], label);
    const id = nonempty(item.id, `${label}.id`);
    if (!/^[A-Za-z0-9_-]+$/.test(id) || lessonIds.has(id))
      throw new Error(`${label}.id must be unique and contain only letters, numbers, _ or -`);
    lessonIds.add(id);
    const memberId = nonempty(item.memberId, `${label}.memberId`);
    if (!memberIds.has(memberId)) throw new Error(`${label}.memberId references an unknown member`);
    if (item.status !== "scheduled" && item.status !== "completed" && item.status !== "cancelled") {
      throw new Error(`${label}.status is invalid`);
    }
    return {
      id,
      memberId,
      startsAt: timestamp(item.startsAt, `${label}.startsAt`),
      status: item.status,
    };
  });
  return { asOf, members, lessons };
}

export async function loadDataset(path?: string): Promise<Dataset> {
  const source = path ?? new URL("../data/demo.json", import.meta.url);
  return validateDataset(JSON.parse(await readFile(source, "utf8")));
}
