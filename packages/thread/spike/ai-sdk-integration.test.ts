import { describe, expect, test } from "bun:test";
import { Chat } from "@ai-sdk/react";
import {
	type ChatTransport,
	readUIMessageStream,
	type UIMessage,
	type UIMessageChunk,
} from "ai";
import { getMessageText, ThreadRuntime } from "../src/runtime";

type PendingRequest = {
	abortSignal: AbortSignal | undefined;
	controller: ReadableStreamDefaultController<UIMessageChunk>;
	messages: UIMessage[];
};

class ControlledTransport implements ChatTransport<UIMessage> {
	readonly requests = new Map<string, PendingRequest>();
	readonly aborted = new Set<string>();

	sendMessages: ChatTransport<UIMessage>["sendMessages"] = (options) => {
		const body = options.body as
			| {
					assistantMessageId?: string;
					tree?: { assistantMessageId?: string };
			  }
			| undefined;
		const assistantMessageId =
			body?.tree?.assistantMessageId ?? body?.assistantMessageId;
		if (!assistantMessageId) {
			throw new Error("Spike transport requires tree.assistantMessageId");
		}

		return Promise.resolve(
			new ReadableStream<UIMessageChunk>({
				start: (controller) => {
					this.requests.set(assistantMessageId, {
						abortSignal: options.abortSignal,
						controller,
						messages: structuredClone(options.messages),
					});
					options.abortSignal?.addEventListener(
						"abort",
						() => {
							this.aborted.add(assistantMessageId);
							controller.enqueue({ type: "abort" });
							controller.close();
						},
						{ once: true },
					);
				},
			}),
		);
	};

	reconnectToStream() {
		return Promise.resolve(null);
	}

	emit(assistantMessageId: string, chunk: UIMessageChunk) {
		const request = this.requests.get(assistantMessageId);
		if (!request) {
			throw new Error(`Unknown request ${assistantMessageId}`);
		}
		request.controller.enqueue(chunk);
	}

	finish(assistantMessageId: string) {
		const request = this.requests.get(assistantMessageId);
		if (!request) {
			throw new Error(`Unknown request ${assistantMessageId}`);
		}
		request.controller.close();
	}
}

function userMessage(id: string, text: string): UIMessage {
	return {
		id,
		parts: [{ text, type: "text" }],
		role: "user",
	};
}

async function waitFor(predicate: () => boolean) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) {
			return;
		}
		await Bun.sleep(1);
	}
	throw new Error("Timed out waiting for spike state");
}

function emitText(
	transport: ControlledTransport,
	assistantMessageId: string,
	textId: string,
	text: string,
) {
	transport.emit(assistantMessageId, { id: textId, type: "text-start" });
	transport.emit(assistantMessageId, {
		delta: text,
		id: textId,
		type: "text-delta",
	});
}

function emitRichResponse(
	transport: ControlledTransport,
	assistantMessageId: string,
) {
	const chunks: UIMessageChunk[] = [
		{ messageId: assistantMessageId, type: "start" },
		{ id: "reasoning-1", type: "reasoning-start" },
		{ delta: "thinking", id: "reasoning-1", type: "reasoning-delta" },
		{ id: "reasoning-1", type: "reasoning-end" },
		{ id: "text-1", type: "text-start" },
		{ delta: "answer", id: "text-1", type: "text-delta" },
		{ id: "text-1", type: "text-end" },
		{
			dynamic: true,
			input: { city: "London" },
			toolCallId: "tool-1",
			toolName: "weather",
			type: "tool-input-available",
		},
		{
			dynamic: true,
			output: { temperature: 21 },
			toolCallId: "tool-1",
			type: "tool-output-available",
		},
		{ data: { pct: 50 }, id: "progress-1", type: "data-progress" },
		{ finishReason: "stop", type: "finish" },
	];
	for (const chunk of chunks) {
		transport.emit(assistantMessageId, chunk);
	}
	transport.finish(assistantMessageId);
}

describe("SPIKE: per-stream AbstractChat engines", () => {
	test("matches @ai-sdk/react Chat output for the same rich stream", async () => {
		const standardTransport = new ControlledTransport();
		const threadTransport = new ControlledTransport();
		const standardChat = new Chat<UIMessage>({
			generateId: () => "assistant-same",
			id: "chat-standard",
			transport: standardTransport,
		});
		const threadRuntime = new ThreadRuntime({
			id: "chat-thread",
			transport: threadTransport,
		});
		const input = userMessage("user-same", "Compare me");

		const standardPromise = standardChat.sendMessage(input, {
			body: { assistantMessageId: "assistant-same" },
		});
		await threadRuntime.sendMessage(input, {
			body: { assistantMessageId: "assistant-same" },
		});
		await waitFor(
			() =>
				standardTransport.requests.has("assistant-same") &&
				threadTransport.requests.has("assistant-same"),
		);

		emitRichResponse(standardTransport, "assistant-same");
		emitRichResponse(threadTransport, "assistant-same");
		await standardPromise;
		await waitFor(() => threadRuntime.getSnapshot().activeStreams.length === 0);

		expect(threadRuntime.getMessage("assistant-same")).toEqual(
			standardChat.messages.at(-1),
		);
	});

	test("keeps the reserved assistant identity and forwards data and tool callbacks", async () => {
		const transport = new ControlledTransport();
		const dataParts: unknown[] = [];
		const toolCalls: unknown[] = [];
		const runtime = new ThreadRuntime({
			onData: (part) => dataParts.push(part),
			onToolCall: ({ toolCall }) => {
				toolCalls.push(toolCall);
			},
			transport,
		});

		await runtime.sendMessage(userMessage("user-a", "A"), {
			body: { assistantMessageId: "assistant-reserved" },
		});
		await waitFor(() => transport.requests.has("assistant-reserved"));

		transport.emit("assistant-reserved", {
			messageId: "server-tried-to-replace-id",
			type: "start",
		});
		transport.emit("assistant-reserved", {
			data: { pct: 25 },
			id: "progress-1",
			type: "data-progress",
		});
		transport.emit("assistant-reserved", {
			dynamic: true,
			input: { city: "London" },
			toolCallId: "tool-1",
			toolName: "weather",
			type: "tool-input-available",
		});
		emitText(transport, "assistant-reserved", "text-1", "identity-safe");
		transport.finish("assistant-reserved");
		await waitFor(() => runtime.getSnapshot().activeStreams.length === 0);

		expect(runtime.getMessage("server-tried-to-replace-id")).toBeUndefined();
		expect(runtime.getMessage("assistant-reserved")).toEqual(
			expect.objectContaining({ id: "assistant-reserved", role: "assistant" }),
		);
		expect(dataParts).toEqual([
			{ data: { pct: 25 }, id: "progress-1", type: "data-progress" },
		]);
		expect(toolCalls).toEqual([
			expect.objectContaining({
				input: { city: "London" },
				toolCallId: "tool-1",
				toolName: "weather",
			}),
		]);
	});

	test("streams concurrently into separate leaves and keeps cursor selection independent", async () => {
		const transport = new ControlledTransport();
		const runtime = new ThreadRuntime({
			concurrency: { maxActiveStreamsPerParent: 1 },
			transport,
		});

		await runtime.sendMessage(userMessage("user-a", "A"), {
			body: { assistantMessageId: "assistant-a" },
		});
		await runtime.sendMessage(userMessage("user-b", "B"), {
			body: { assistantMessageId: "assistant-b" },
			tree: { follow: false, from: null },
		});
		await waitFor(() => transport.requests.size === 2);

		expect(
			transport.requests.get("assistant-a")?.messages.map((m) => m.id),
		).toEqual(["user-a"]);
		expect(
			transport.requests.get("assistant-b")?.messages.map((m) => m.id),
		).toEqual(["user-b"]);
		expect(runtime.getSnapshot().activeStreams).toHaveLength(2);

		emitText(transport, "assistant-a", "text-a", "alpha");
		emitText(transport, "assistant-b", "text-b", "beta");
		await waitFor(
			() =>
				getMessageText(runtime.getMessage("assistant-a") as UIMessage) ===
					"alpha" &&
				getMessageText(runtime.getMessage("assistant-b") as UIMessage) ===
					"beta",
		);

		runtime.setCursor("user-b");
		transport.emit("assistant-a", {
			delta: "-hidden",
			id: "text-a",
			type: "text-delta",
		});
		transport.emit("assistant-b", {
			delta: "-visible",
			id: "text-b",
			type: "text-delta",
		});
		await waitFor(
			() =>
				getMessageText(runtime.getMessage("assistant-a") as UIMessage) ===
					"alpha-hidden" &&
				getMessageText(runtime.getMessage("assistant-b") as UIMessage) ===
					"beta-visible",
		);

		expect(runtime.getSnapshot().cursorId).toBe("user-b");
		expect(runtime.getPath("assistant-a").map((message) => message.id)).toEqual(
			["user-a", "assistant-a"],
		);
		expect(runtime.getPath("assistant-b").map((message) => message.id)).toEqual(
			["user-b", "assistant-b"],
		);

		transport.finish("assistant-a");
		transport.finish("assistant-b");
		await waitFor(() => runtime.getSnapshot().activeStreams.length === 0);
	});

	test("stopping one branch does not abort another branch", async () => {
		const transport = new ControlledTransport();
		const runtime = new ThreadRuntime({ transport });

		await runtime.sendMessage(userMessage("user-a", "A"), {
			body: { assistantMessageId: "assistant-a" },
		});
		await runtime.sendMessage(userMessage("user-b", "B"), {
			body: { assistantMessageId: "assistant-b" },
			tree: { follow: false, from: null },
		});
		await waitFor(() => transport.requests.size === 2);

		runtime.stopStream("stream:assistant-a");
		await waitFor(() => transport.aborted.has("assistant-a"));
		expect(transport.aborted.has("assistant-b")).toBe(false);

		emitText(transport, "assistant-b", "text-b", "still-running");
		transport.finish("assistant-b");
		await waitFor(() => runtime.getSnapshot().activeStreams.length === 0);
		expect(getMessageText(runtime.getMessage("assistant-b") as UIMessage)).toBe(
			"still-running",
		);
	});
});

describe("SPIKE: public readUIMessageStream reducer", () => {
	test("reduces reasoning, text, tool, and data chunks into message snapshots", async () => {
		const chunks: UIMessageChunk[] = [
			{ messageId: "assistant-reserved", type: "start" },
			{ id: "reasoning-1", type: "reasoning-start" },
			{ delta: "thinking", id: "reasoning-1", type: "reasoning-delta" },
			{ id: "reasoning-1", type: "reasoning-end" },
			{ id: "text-1", type: "text-start" },
			{ delta: "answer", id: "text-1", type: "text-delta" },
			{ id: "text-1", type: "text-end" },
			{
				dynamic: true,
				input: { city: "London" },
				toolCallId: "tool-1",
				toolName: "weather",
				type: "tool-input-available",
			},
			{
				dynamic: true,
				output: { temperature: 21 },
				toolCallId: "tool-1",
				type: "tool-output-available",
			},
			{ data: { pct: 50 }, id: "progress-1", type: "data-progress" },
			{ finishReason: "stop", type: "finish" },
		];
		const snapshots: UIMessage[] = [];
		const stream = new ReadableStream<UIMessageChunk>({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(chunk);
				}
				controller.close();
			},
		});

		for await (const message of readUIMessageStream({
			message: { id: "assistant-reserved", parts: [], role: "assistant" },
			stream,
			terminateOnError: true,
		})) {
			snapshots.push(message);
		}

		const finalMessage = snapshots.at(-1);
		expect(finalMessage?.id).toBe("assistant-reserved");
		expect(finalMessage?.parts).toContainEqual({
			providerMetadata: undefined,
			state: "done",
			text: "thinking",
			type: "reasoning",
		});
		expect(finalMessage?.parts).toContainEqual({
			providerMetadata: undefined,
			state: "done",
			text: "answer",
			type: "text",
		});
		expect(finalMessage?.parts).toContainEqual(
			expect.objectContaining({
				output: { temperature: 21 },
				state: "output-available",
				toolCallId: "tool-1",
				toolName: "weather",
				type: "dynamic-tool",
			}),
		);
		expect(finalMessage?.parts).toContainEqual({
			data: { pct: 50 },
			id: "progress-1",
			type: "data-progress",
		});
	});

	test("accepts the server start ID over the supplied shell ID", async () => {
		const stream = new ReadableStream<UIMessageChunk>({
			start(controller) {
				controller.enqueue({ messageId: "server-id", type: "start" });
				controller.enqueue({ id: "text-1", type: "text-start" });
				controller.enqueue({
					delta: "hello",
					id: "text-1",
					type: "text-delta",
				});
				controller.close();
			},
		});
		let finalMessage: UIMessage | undefined;

		for await (const message of readUIMessageStream({
			message: { id: "reserved-id", parts: [], role: "assistant" },
			stream,
		})) {
			finalMessage = message;
		}

		expect(finalMessage?.id).toBe("server-id");
	});
});
