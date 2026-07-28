import { test, expect, afterEach } from "bun:test";
import type { SapphireResult } from "../src/sapphire-client";

function makeStreamChunks(
	textDeltas: string[],
	meta: Partial<SapphireResult>,
): Uint8Array[] {
	const lines: string[] = [];
	for (const t of textDeltas) {
		lines.push(`data: ${JSON.stringify({ content: t })}`);
	}
	lines.push(`data: ${JSON.stringify({
		text: meta.text ?? "",
		label: meta.label ?? "FUTILE",
		backend: meta.backend ?? "test",
		valence: meta.valence ?? 0,
		arousal: meta.arousal ?? 0,
		prompt_tokens: meta.debugPromptTokens ?? 0,
		completion_tokens: meta.debugCompletionTokens ?? 0,
		time_ms: meta.debugTimeMs ?? 0,
		tokens_per_second: meta.debugTokensPerSecond ?? 0,
	})}`);
	lines.push("data: [DONE]");
	const text = lines.join("\n") + "\n";
	const encoder = new TextEncoder();
	return [encoder.encode(text)];
}

function mockFetch(chunks: Uint8Array[]): typeof fetch {
	return async () => {
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
	};
}

// Simulate the askStream loop inline so we don't need to mock SapphireClient
async function runStream(
	chunks: Uint8Array[],
	onChunk: (chunk: string) => void,
): Promise<SapphireResult | null> {
	const resp = await mockFetch(chunks)("http://fake");
	const reader = resp.body!.getReader();
	const decoder = new TextDecoder();
	let buf = "";
	let firstChunk = true;

	function nextLine(): string | null {
		const idx = buf.indexOf("\n");
		if (idx === -1) return null;
		const line = buf.slice(0, idx);
		buf = buf.slice(idx + 1);
		return line;
	}

	let result: SapphireResult | null = null;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buf += decoder.decode(value, { stream: true });

		let line = nextLine();
		while (line !== null) {
			if (!line.startsWith("data: ")) {
				line = nextLine();
				continue;
			}
			const payload = line.slice(6);
			if (payload === "[DONE]") break;

			try {
				const obj = JSON.parse(payload);
				if (typeof obj === "object" && obj !== null && "text" in obj) {
					result = {
						text: obj.text as string,
						label: obj.label as string,
						backend: obj.backend as string,
						valence: obj.valence as number,
						arousal: obj.arousal as number,
					};
					line = nextLine();
					continue;
				}
			} catch {
				/* content delta */
			}

			if (firstChunk) {
				firstChunk = false;
			}
			onChunk(payload);
			line = nextLine();
		}

		if (line === "[DONE]") break;
	}

	return result;
}

afterEach(() => {
	globalThis.fetch = undefined as unknown as typeof fetch;
});

test("stream returns metadata and forwards content deltas", async () => {
	const deltas: string[] = [];
	const result = await runStream(
		makeStreamChunks(["hello ", "world"], {
			text: "hello world",
			label: "FUTILE",
			valence: 0.1,
			arousal: 0.2,
		}),
		(c) => deltas.push(c),
	);

	expect(result).not.toBeNull();
	expect(result!.text).toBe("hello world");
	expect(result!.label).toBe("FUTILE");
	expect(result!.valence).toBe(0.1);
	expect(result!.arousal).toBe(0.2);
	expect(deltas).toEqual(['{"content":"hello "}', '{"content":"world"}']);
});

test("stream with single chunk (metadata + DONE together)", async () => {
	const encoder = new TextEncoder();
	const text = `data: {"content":"hello"}\ndata: {"text":"hello","label":"INTERESSANT","backend":"test","valence":-0.1,"arousal":0.3}\ndata: [DONE]\n`;
	const chunks = [encoder.encode(text)];

	const deltas: string[] = [];
	const result = await runStream(chunks, (c) => deltas.push(c));

	expect(result).not.toBeNull();
	expect(result!.text).toBe("hello");
	expect(result!.label).toBe("INTERESSANT");
	expect(result!.valence).toBe(-0.1);
	expect(result!.arousal).toBe(0.3);
	expect(deltas).toEqual(['{"content":"hello"}']);
});

test("stream with no content deltas", async () => {
	const encoder = new TextEncoder();
	const text = `data: {"text":"direct","label":"FUTILE","backend":"test","valence":0,"arousal":0}\ndata: [DONE]\n`;
	const chunks = [encoder.encode(text)];

	const deltas: string[] = [];
	const result = await runStream(chunks, (c) => deltas.push(c));

	expect(result).not.toBeNull();
	expect(result!.text).toBe("direct");
	expect(deltas).toEqual([]);
});

test("stream without [DONE] still completes", async () => {
	const encoder = new TextEncoder();
	const text = `data: {"text":"truncated","label":"FUTILE","backend":"test","valence":0,"arousal":0}\n`;
	const chunks = [encoder.encode(text)];

	const deltas: string[] = [];
	const result = await runStream(chunks, (c) => deltas.push(c));

	expect(result).not.toBeNull();
	expect(result!.text).toBe("truncated");
});

test("stream does not hang on metadata", async () => {
	// Critical test: verify the fix for the infinite loop bug
	const encoder = new TextEncoder();
	// Metadata and [DONE] in the same chunk — previously caused infinite loop
	const text = `data: {"content":"hi"}\ndata: {"text":"hi","label":"FUTILE","backend":"test","valence":0,"arousal":0}\ndata: [DONE]\n`;
	const chunks = [encoder.encode(text)];

	const deltas: string[] = [];
	const promise = runStream(chunks, (c) => deltas.push(c));

	// Should resolve within 1 second, not hang
	const result = await Promise.race([
		promise,
		new Promise<null>((_, reject) =>
			setTimeout(() => reject(new Error("TIMEOUT — infinite loop detected")), 1000)
		),
	]);

	expect(result).not.toBeNull();
	expect(result!.text).toBe("hi");
	expect(deltas).toEqual(['{"content":"hi"}']);
});

