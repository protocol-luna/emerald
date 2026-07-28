import { test, expect, beforeEach, afterEach, mock } from "bun:test";
import { SapphireClient } from "../src/sapphire-client";

const fakeConfig = {
	sapphire_host: "127.0.0.1",
	sapphire_port: 9999,
	sapphire_bot_username: "testbot",
} as const;

let client: SapphireClient;
let fetchMock: ReturnType<typeof mock>;

function makeJsonResponse(data: unknown): Response {
	return {
		ok: true,
		status: 200,
		json: () => Promise.resolve(data),
		text: () => Promise.resolve(JSON.stringify(data)),
	} as Response;
}

function makeStreamResponse(chunks: Uint8Array[]): Response {
	let i = 0;
	const reader = {
		read(): Promise<{ done: boolean; value?: Uint8Array }> {
			if (i < chunks.length) {
				return Promise.resolve({ done: false, value: chunks[i++] });
			}
			return Promise.resolve({ done: true });
		},
	};
	return {
		ok: true,
		status: 200,
		body: { getReader: () => reader },
		text: () => Promise.resolve(""),
		json: () => Promise.resolve({}),
	} as Response;
}

beforeEach(() => {
	fetchMock = mock(() => new Promise(() => {}));
	globalThis.fetch = fetchMock;
	client = new SapphireClient(fakeConfig as any);
});

afterEach(() => {
	delete (globalThis as any).fetch;
});

test("ask returns parsed result", async () => {
	fetchMock.mockImplementation(() =>
		Promise.resolve(
			makeJsonResponse({
				text: "hello world",
				label: "FUTILE",
				backend: "ollama",
				valence: 0.1,
				arousal: -0.2,
				debug_prompt_tokens: 42,
				debug_completion_tokens: 10,
				debug_time_ms: 500,
				debug_tokens_per_second: 20,
				debug_classification_confidence: 0.85,
			}),
		),
	);

	const result = await client.ask("hello", "session:test", true);

	expect(result.text).toBe("hello world");
	expect(result.label).toBe("FUTILE");
	expect(result.backend).toBe("ollama");
	expect(result.valence).toBe(0.1);
	expect(result.arousal).toBe(-0.2);
	expect(result.debugPromptTokens).toBe(42);
	expect(result.debugCompletionTokens).toBe(10);
	expect(result.debugTimeMs).toBe(500);
	expect(result.debugClassificationConfidence).toBe(0.85);

	// Verify the fetch was called with correct URL and body
	const call = fetchMock.mock.calls[0];
	expect(call[0]).toBe("http://127.0.0.1:9999/v1/respond");
	const body = JSON.parse(call[1]?.body as string);
	expect(body.username).toBe("testbot");
	expect(body.text).toBe("hello");
	expect(body.stream).toBe(false);
});

test("askStream returns metadata and forwards chunks", async () => {
	const encoder = new TextEncoder();
	const chunk = encoder.encode(
		'data: {"content":"hello "}\ndata: {"content":"world"}\ndata: {"text":"hello world","label":"FUTILE","backend":"ollama","valence":0.1,"arousal":-0.2}\ndata: [DONE]\n',
	);
	fetchMock.mockImplementation(() =>
		Promise.resolve(makeStreamResponse([chunk])),
	);

	const deltas: string[] = [];
	const result = await client.askStream(
		"hello",
		"session:test",
		false,
		(c) => deltas.push(c),
	);

	expect(result.text).toBe("hello world");
	expect(result.label).toBe("FUTILE");
	expect(result.valence).toBe(0.1);
	expect(result.arousal).toBe(-0.2);
	expect(deltas).toEqual(['{"content":"hello "}', '{"content":"world"}']);
});

test("askStream works with metadata and [DONE] in same chunk", async () => {
	const encoder = new TextEncoder();
	const chunk = encoder.encode(
		'data: {"text":"direct","label":"INTERESSANT","backend":"test","valence":0,"arousal":0}\ndata: [DONE]\n',
	);
	fetchMock.mockImplementation(() =>
		Promise.resolve(makeStreamResponse([chunk])),
	);

	const deltas: string[] = [];
	const result = await client.askStream("hi", "session:test", false, (c) =>
		deltas.push(c),
	);

	expect(result.text).toBe("direct");
	expect(result.label).toBe("INTERESSANT");
	expect(deltas).toEqual([]);
});

test("askStream does not hang on metadata (regression test)", async () => {
	const encoder = new TextEncoder();
	const chunk = encoder.encode(
		'data: {"content":"hi"}\ndata: {"text":"hi","label":"FUTILE","backend":"test","valence":0,"arousal":0}\ndata: [DONE]\n',
	);
	fetchMock.mockImplementation(() =>
		Promise.resolve(makeStreamResponse([chunk])),
	);

	const deltas: string[] = [];
	const promise = client.askStream("hi", "session:test", false, (c) =>
		deltas.push(c),
	);

	const result = await Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("TIMEOUT — infinite loop")), 500),
		),
	]);

	expect(result.text).toBe("hi");
	expect(deltas).toEqual(['{"content":"hi"}']);
});

test("askStream throws on HTTP error", async () => {
	fetchMock.mockImplementation(() =>
		Promise.resolve({
			ok: false,
			status: 500,
			text: () => Promise.resolve("Internal Server Error"),
		} as Response),
	);

	expect(
		client.askStream("hi", "session:test", false, () => {}),
	).rejects.toThrow("sapphire error 500");
});

test("askStream throws when stream ends without metadata", async () => {
	const encoder = new TextEncoder();
	const chunk = encoder.encode("data: [DONE]\n");
	fetchMock.mockImplementation(() =>
		Promise.resolve(makeStreamResponse([chunk])),
	);

	expect(
		client.askStream("hi", "session:test", false, () => {}),
	).rejects.toThrow("sapphire stream ended without final metadata");
});

test("ask throws on HTTP error", async () => {
	fetchMock.mockImplementation(() =>
		Promise.resolve({
			ok: false,
			status: 503,
			text: () => Promise.resolve("Service Unavailable"),
		} as Response),
	);

	expect(client.ask("hi", "session:test")).rejects.toThrow(
		"sapphire error 503",
	);
});
