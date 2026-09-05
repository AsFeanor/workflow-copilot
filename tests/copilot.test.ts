import test from 'node:test';
import assert from 'node:assert/strict';
import {runCopilot, validateAnswer} from '../src/copilot.ts';
import type {CopilotAnswer, ModelItem, ModelProvider, ModelRequest, ModelResponse, ToolRegistry} from '../src/types.ts';

const evidence = ['snapshot:2026-09-05', 'member:m1'];
const answer: CopilotAnswer = {
  summary: 'One renewal needs review.',
  facts: [{text: 'Member m1 has one lesson remaining.', sourceIds: ['member:m1']}],
  drafts: [{kind: 'renewal_follow_up', memberId: 'm1', reason: 'Review the remaining lesson.', sourceIds: ['member:m1']}],
  limitations: [],
};
const call = (id = 'call_1', args = '{}'): ModelItem => ({type: 'function_call', call_id: id, name: 'read_members', arguments: args});
const final = (value: unknown = answer): ModelResponse => ({output: [{type: 'message', role: 'assistant', content: [{type: 'output_text', text: JSON.stringify(value)}]}]});
const registry = (execute: ToolRegistry['execute'] = () => ({ok: true, data: {id: 'm1', remainingLessons: 1}, sources: evidence})): ToolRegistry => ({
  definitions: [{type: 'function', name: 'read_members', description: 'Read fixture members.', strict: true, parameters: {type: 'object', properties: {}, required: [], additionalProperties: false}}],
  execute,
});
function scripted(responses: ModelResponse[]) {
  const requests: ModelRequest[] = [];
  const provider: ModelProvider = {async respond(request) {
    requests.push(structuredClone(request));
    const response = responses[requests.length - 1];
    assert.ok(response, 'The copilot exceeded the scripted provider responses');
    return structuredClone(response);
  }};
  return {provider, requests};
}

test('a tool-backed answer retains encrypted reasoning, call outputs, evidence and usage', async () => {
  const reasoning = {type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque-reasoning'};
  const script = scripted([
    {output: [reasoning, call()], usage: {input_tokens: 10, output_tokens: 5}},
    {...final(), usage: {input_tokens: 20, output_tokens: 7}},
  ]);
  const result = await runCopilot('Which renewals need review?', script.provider, registry(), {mode: 'demo'});
  assert.deepEqual(result.answer, answer);
  assert.deepEqual(result.usage, {inputTokens: 30, outputTokens: 12});
  assert.equal(result.mode, 'demo');
  assert.equal(result.modelCalls, 2);
  assert.equal(result.trace.length, 1);
  assert.deepEqual(result.trace[0].sources, evidence);
  assert.equal(result.trace[0].ok, true);
  assert.deepEqual(script.requests[1].input.slice(1, 3), [reasoning, call()]);
  const output = script.requests[1].input[3];
  assert.equal(output.type, 'function_call_output');
  assert.equal(output.call_id, 'call_1');
  assert.deepEqual(JSON.parse(String(output.output)).sources, evidence);
  assert.equal(script.requests[0].input.length, 1, 'Later turns must not mutate an earlier request');
});

test('sources returned by a failed tool do not authorize factual claims', async () => {
  const script = scripted([{output: [call()]}, final()]);
  await assert.rejects(runCopilot('Review renewals', script.provider, registry(() => ({ok: false, error: 'Not found', sources: evidence}))), /unobserved source/);
  assert.throws(() => validateAnswer({...answer, facts: [{text: 'Invented', sourceIds: ['member:unknown']}]}, new Set(evidence)), /unobserved source/);
});

test('a draft must cite its own observed member, not another valid source', () => {
  const value = {...answer, drafts: [{...answer.drafts[0], memberId: 'm2'}]};
  assert.throws(() => validateAnswer(value, new Set([...evidence, 'member:m2'])), /own observed member/);
});

test('a provider requesting tools indefinitely stops at the model-call budget', async () => {
  let modelCalls = 0, executions = 0;
  const provider: ModelProvider = {async respond() {return {output: [call(`call_${++modelCalls}`)]};}};
  await assert.rejects(runCopilot('Review renewals', provider, registry(() => {executions++; return {ok: true, sources: evidence};}), {maxModelCalls: 2}), /Model-call budget exhausted/);
  assert.equal(modelCalls, 2);
  assert.equal(executions, 2);
});

test('an oversized tool batch is rejected before any tool executes', async () => {
  let executions = 0;
  const script = scripted([{output: [call('a'), call('b'), call('c')]}]);
  await assert.rejects(runCopilot('Review renewals', script.provider, registry(() => {executions++; return {ok: true};}), {maxToolCalls: 2}), /Tool-call budget exhausted/);
  assert.equal(executions, 0);
});

test('duplicate call IDs are rejected within a batch and across model turns', async () => {
  for (const responses of [[{output: [call('same'), call('same')]}], [{output: [call('same')]}, {output: [call('same')]}]]) {
    let executions = 0;
    const script = scripted(responses);
    await assert.rejects(runCopilot('Review renewals', script.provider, registry(() => {executions++; return {ok: true};})), /duplicate tool call/);
    assert.equal(executions, responses.length - 1);
  }
});

test('malformed arguments become safe tool errors so the model can recover', async () => {
  let executions = 0;
  const limitation = {summary: 'Unable to read evidence.', facts: [], drafts: [], limitations: ['The read failed.']};
  const script = scripted([{output: [call('bad', '{"token":"secret-do-not-expose"')]}, final(limitation)]);
  const result = await runCopilot('Review renewals', script.provider, registry(() => {executions++; throw new Error('secret-do-not-expose');}));
  assert.equal(executions, 0);
  assert.equal(result.trace[0].ok, false);
  assert.deepEqual(result.trace[0].sources, []);
  const toolOutput = JSON.parse(String(script.requests[1].input.at(-1)?.output));
  assert.deepEqual(toolOutput, {ok: false, error: 'Invalid tool input or tool execution failure'});
  assert.equal(JSON.stringify(result).includes('secret-do-not-expose'), false);
});

test('model refusal is rejected instead of being presented as an accepted answer', async () => {
  const script = scripted([{output: [{type: 'message', content: [{type: 'refusal', refusal: 'No.'}]}]}]);
  await assert.rejects(runCopilot('Review renewals', script.provider, registry()), /declined/);
});

test('invalid model JSON is rejected without leaking its raw contents', async () => {
  const script = scripted([{output: [{type: 'message', content: [{type: 'output_text', text: 'secret-do-not-expose: not JSON'}]}]}]);
  await assert.rejects(runCopilot('Review renewals', script.provider, registry()), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /valid JSON/);
    assert.doesNotMatch(error.message, /secret-do-not-expose/);
    return true;
  });
});
