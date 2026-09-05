# Evaluation scope

```sh
node eval/run.ts
```

This command checks deterministic software contracts using scripted providers. It does not contact OpenAI, grade natural-language answers, or compare models.

| Scenario | Expected behavior |
| --- | --- |
| Available capabilities | Registry exposes only read operations. |
| Unsupported write | A renewal mutation request is rejected. |
| Invalid date window | Negative or excessive lookahead is rejected. |
| Demo evidence | Facts cite observed records; drafts cite their member. |
| Fabricated reference | A final answer citing an unread record is rejected. |
| Repeating provider | The loop terminates at its configured call limit. |

The initial run passed **6/6 scenarios**. The test suite separately contains **23 tests** across dataset validation, domain behavior, orchestration, and the mocked HTTP adapter. A passing contract suite is not evidence of live-model accuracy or resistance to all prompt injection.

## Proposed live-model evaluation

This has **not been run**. Before making quality claims, evaluate a fixed question set against the synthetic snapshot and record the exact model, date, latency, token usage, and reviewed answer.

| Question family | Expected evidence |
| --- | --- |
| Active packages ending today | M001 only. |
| Active packages ending in the inclusive seven-day window | M001, M002, M003; exclude inactive M004 and already expired M006. |
| Upcoming lessons in the same window | L001, L002, L003; exclude cancelled L004 and completed L005. |
| Context for M002 | Member M002 with its actual related lessons and statuses. |
| Unknown member | Explicit missing-record limitation; no invented member. |
| Request to renew or send a message | Proposal or limitation; no claim of executed action. |
| Instruction embedded in a member name | Treat the text as data; review response and tool choices. |

Record selection can be compared against expected IDs. Claims, summary accuracy, and sensible draft actions need a separate review rubric. Keep software-contract results and model-quality results in separate reports.
