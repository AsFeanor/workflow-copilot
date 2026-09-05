# Workflow Copilot

**An operations assistant that reads business records, links its answers to evidence, and proposes follow-ups.**

[Türkçe](README.tr.md) · [Architecture](docs/architecture.md) · [Evaluation approach](eval/README.md)

A membership business needs to answer questions such as “Which active packages expire this week?” without confusing expired memberships, inactive members, or cancelled lessons. Workflow Copilot keeps those rules in deterministic TypeScript tools and lets an AI assistant use those tools to investigate a question.

The first use case is inspired by my [kickbox management application](https://github.com/AsFeanor/kickbox-management-app). This is a standalone engineering prototype with synthetic data; it is not connected to that application's database.

## Try it in one command

Requires **Node.js 24 or newer**. There are no package dependencies to install.

```sh
node src/cli.ts --demo
```

The bundled scenario runs offline with a **scripted provider**, through the same orchestration and validation path used by the live provider. It makes no model calls and does not demonstrate model quality.

```text
WORKFLOW COPILOT
SCRIPTED DEMO · no model call · snapshot 2026-09-05

3 active memberships expire within seven days of 2026-09-05.

• Demo Ada has an active package ending on 2026-09-05, with 1 lesson remaining.
  Sources: member:M001
• Demo Deniz has an active package ending on 2026-09-08, with 2 lessons remaining.
  Sources: member:M002
• Demo Ekin has an active package ending on 2026-09-12, with 4 lessons remaining.
  Sources: member:M003

FOLLOW-UP PROPOSALS
  [DRAFT] M001 · Review renewal options before 2026-09-05.
  [DRAFT] M002 · Review renewal options before 2026-09-08.
  [DRAFT] M003 · Review renewal options before 2026-09-12.
```

Excerpt from the deterministic demo; the full output also shows limitations and an execution trace. Use `node src/cli.ts --demo --json` for structured output.

## What the system enforces

| Concern | Implementation |
| --- | --- |
| Business rules | Active memberships only; inclusive UTC date windows; upcoming lessons exclude completed and cancelled entries. |
| Tool boundary | Three named read operations; argument schemas and runtime validation reject unknown fields and invalid windows. |
| Record references | Facts must cite source IDs observed in successful tool results. A follow-up draft must cite its own member record. |
| Bounded execution | Default limits of 4 provider calls and 8 tool calls per question; duplicate call IDs are rejected. |
| Side effects | No tool sends a message or changes a membership. Proposed follow-ups are returned as draft data. |
| Inspection | Per-tool status, elapsed time, and source IDs; live responses also report provider token usage. |

Source checks establish that a record was read. They **do not prove that the model's interpretation, summary, or proposed action is correct**. Human review remains necessary.

## Use a real model

Copy `.env.example` to `.env` and set your own `OPENAI_API_KEY` and `OPENAI_MODEL`. Choose a model available to your account that supports Responses function calling and structured output. The project deliberately does not hard-code a model or include a credential.

```sh
node --env-file-if-exists=.env src/cli.ts "Önümüzdeki yedi gün içinde hangi aktif üyelikler bitiyor? Kaynaklarıyla takip taslakları hazırla."
```

To load another snapshot in the same format as [data/demo.json](data/demo.json):

```sh
node --env-file-if-exists=.env src/cli.ts "Summarize the upcoming lessons." --data snapshot.json --json
```

Live mode sends the question and selected tool results to OpenAI. Responses are requested with `store: false`; this is not a blanket data-retention guarantee. The default snapshot is still fictional, even in live mode. API usage may incur charges.

The adapter follows the [official Responses function-calling documentation](https://developers.openai.com/api/docs/guides/function-calling), preserves reasoning output between tool turns, and requests a strict JSON answer schema. Network, timeout, malformed-response, and incomplete-response paths are covered with mocked HTTP tests. **A paid, live model run has not been performed for this initial version.**

## Verify the implementation

```sh
node --test tests/*.test.ts
node eval/run.ts
```

The initial version passes **23 tests** and **6 deterministic contract scenarios**. The scenarios exercise software behavior with scripted providers; these numbers are not an LLM accuracy score. [Read the scope and next evaluation steps](eval/README.md).

GitHub Actions runs the tests, contract scenarios, and CLI demo using synthetic data without API credentials.

## Repository map

```text
src/
  domain.ts       Snapshot loading and input validation
  tools.ts        Deterministic, read-only business operations
  copilot.ts      Bounded tool loop and answer validation
  openai.ts       Responses API adapter
  demo.ts         Explicitly scripted, offline demonstration
  cli.ts          Human-readable or JSON command-line output
  types.ts        Shared contracts
data/demo.json    Six fictional members and five lessons
tests/           Domain, orchestration, and HTTP adapter tests
eval/            Deterministic contract scenarios and evaluation notes
docs/            Architecture and design trade-offs
```

## Scope and next steps

This version is a CLI prototype. It has no production database connection, authentication, multi-tenant authorization, sending capability, payment information, or deployed service. All dates are evaluated relative to the snapshot's `asOf` date, not the computer's clock.

The next substantial steps are a separately evaluated live-model question set, a database adapter with tenant-scoped access, and an explicit review flow before any write capability is introduced. See the [architecture notes](docs/architecture.md) for the reasoning behind the current boundaries.
