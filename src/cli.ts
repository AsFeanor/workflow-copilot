import { loadDataset } from "./domain.ts";
import { createToolRegistry } from "./tools.ts";
import { runCopilot } from "./copilot.ts";
import { createDemoProvider, DEMO_QUESTION } from "./demo.ts";
import { createOpenAIProvider } from "./openai.ts";

const help = `Workflow Copilot — an operations assistant with inspectable evidence

  node src/cli.ts --demo [--json]
  node --env-file-if-exists=.env src/cli.ts "Your question" [--data snapshot.json] [--json]

Demo: fixed scenario, synthetic data, scripted provider; no network or API key.
Live: requires OPENAI_API_KEY and OPENAI_MODEL; sends the question and selected
tool results to OpenAI. All available tools read data. Actions are drafts only.
`;

async function main() {
  const args = process.argv.slice(2);
  let demo = false,
    json = false,
    dataPath: string | undefined;
  const words: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      console.log(help);
      return;
    }
    if (arg === "--demo") demo = true;
    else if (arg === "--json") json = true;
    else if (arg === "--data") {
      dataPath = args[++i];
      if (!dataPath || dataPath.startsWith("--"))
        throw new Error("--data requires a snapshot file");
    } else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else words.push(arg);
  }
  if (demo && (words.length || dataPath))
    throw new Error(
      "The scripted demo uses its fixed scenario and bundled snapshot. Use live mode for your own question or data.",
    );
  const question = demo ? DEMO_QUESTION : words.join(" ");
  if (!question.trim()) throw new Error("Supply a question or use --demo. See --help.");
  const dataset = await loadDataset(dataPath);
  const provider = demo
    ? createDemoProvider()
    : createOpenAIProvider({
        apiKey: process.env.OPENAI_API_KEY ?? "",
        model: process.env.OPENAI_MODEL ?? "",
      });
  const result = await runCopilot(question, provider, createToolRegistry(dataset), {
    mode: demo ? "demo" : "live",
  });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `\nWORKFLOW COPILOT\n${demo ? "SCRIPTED DEMO · no model call" : "LIVE MODEL"} · snapshot ${dataset.asOf}\n`,
  );
  console.log(result.answer.summary);
  for (const fact of result.answer.facts)
    console.log(`\n• ${fact.text}\n  Sources: ${fact.sourceIds.join(", ")}`);
  if (result.answer.drafts.length) console.log("\nFOLLOW-UP PROPOSALS");
  for (const draft of result.answer.drafts)
    console.log(`  [DRAFT] ${draft.memberId} · ${draft.reason}`);
  console.log("\nLIMITATIONS");
  for (const item of result.answer.limitations) console.log(`  ${item}`);
  console.log("\nEXECUTION TRACE");
  for (const event of result.trace)
    console.log(
      `  ${event.ok ? "OK" : "ERROR"} ${event.tool} · ${event.sources.length} sources · ${event.durationMs} ms`,
    );
  console.log(
    `\n${result.modelCalls} provider steps · ${result.durationMs} ms${demo ? "" : ` · ${result.usage.inputTokens} input / ${result.usage.outputTokens} output tokens`}\n`,
  );
}
main().catch((error) => {
  console.error(`Workflow Copilot: ${error instanceof Error ? error.message : "Request failed"}`);
  process.exitCode = 1;
});
