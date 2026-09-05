import test from 'node:test';
import assert from 'node:assert/strict';
import {answerSchema, createOpenAIProvider} from '../src/openai.ts';
import type {ModelRequest} from '../src/types.ts';

const secret = 'sk-test-secret-do-not-expose';
const request: ModelRequest = {
  instructions: 'Read evidence before answering.',
  input: [{type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque-reasoning'}, {type: 'message', role: 'user', content: 'Review renewals'}],
  tools: [{type: 'function', name: 'read_members', description: 'Read members', strict: true, parameters: {type: 'object', properties: {}, required: [], additionalProperties: false}}],
};
function safeError(error: unknown, pattern: RegExp) {
  assert.ok(error instanceof Error);
  assert.match(error.message, pattern);
  assert.doesNotMatch(error.message, /sk-test/);
  return true;
}

test('the Responses request uses strict structured output, tools and stateless encrypted reasoning', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init?.method, 'POST');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('Authorization'), `Bearer ${secret}`);
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.ok(init?.signal instanceof AbortSignal);
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, {
      model: 'test-model', instructions: request.instructions, input: request.input, tools: request.tools,
      parallel_tool_calls: false, store: false, include: ['reasoning.encrypted_content'], max_output_tokens: 2400,
      text: {format: {type: 'json_schema', name: 'operations_answer', strict: true, schema: answerSchema}},
    });
    assert.equal(body.text.format.schema.additionalProperties, false);
    assert.deepEqual(body.text.format.schema.required, ['summary', 'facts', 'drafts', 'limitations']);
    return Response.json({status: 'completed', output: [], usage: {input_tokens: 4, output_tokens: 2}});
  };
  const response = await createOpenAIProvider({apiKey: secret, model: 'test-model', fetcher}).respond(request);
  assert.equal(calls, 1);
  assert.deepEqual(response.usage, {input_tokens: 4, output_tokens: 2});
});

test('HTTP failures expose the status but never the service response body or API key', async () => {
  const fetcher: typeof fetch = async () => new Response(`Quota error: ${secret}`, {status: 429});
  await assert.rejects(createOpenAIProvider({apiKey: secret, model: 'test-model', fetcher}).respond(request), error => safeError(error, /HTTP 429/));
});

test('incomplete and malformed output envelopes are rejected', async () => {
  for (const body of [null, {status: 'incomplete', output: []}, {status: 'failed', output: []}, {status: 'completed', output: null}, {output: []}]) {
    const fetcher: typeof fetch = async () => Response.json(body);
    await assert.rejects(createOpenAIProvider({apiKey: secret, model: 'test-model', fetcher}).respond(request), /incomplete/);
  }
});

test('the configured timeout aborts a pending request and returns a safe error', async () => {
  let signal: AbortSignal | null | undefined;
  const fetcher: typeof fetch = async (_url, init) => {
    signal = init?.signal;
    assert.ok(signal);
    return new Promise<Response>((_resolve, reject) => {
      const guard = setTimeout(() => reject(new Error('Abort signal did not fire')), 1000);
      signal!.addEventListener('abort', () => {clearTimeout(guard); reject(new Error(secret));}, {once: true});
    });
  };
  await assert.rejects(createOpenAIProvider({apiKey: secret, model: 'test-model', timeoutMs: 10, fetcher}).respond(request), error => safeError(error, /timed out or could not connect/));
  assert.equal(signal?.aborted, true);
});

test('network exceptions do not expose credentials from their error messages', async () => {
  const fetcher: typeof fetch = async () => {throw new Error(`Connection failed with ${secret}`);};
  await assert.rejects(createOpenAIProvider({apiKey: secret, model: 'test-model', fetcher}).respond(request), error => safeError(error, /could not connect/));
});

test('invalid JSON response bodies are rejected without leaking their contents', async () => {
  const fetcher: typeof fetch = async () => new Response(secret, {status: 200, headers: {'Content-Type': 'application/json'}});
  await assert.rejects(createOpenAIProvider({apiKey: secret, model: 'test-model', fetcher}).respond(request), error => safeError(error, /response|JSON/i));
});
