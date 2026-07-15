import { describe, expect, test } from "bun:test";
import { Chat } from "@ai-sdk/react";
import {
	type ChatTransport,
	readUIMessageStream,
	type UIMessage,
	type UIMessageChunk,
} from "ai";
import { getMessageText, ThreadChat } from "../src/thread-chat";

type PendingRequest = {
	abortSignal: AbortSignal | undefined;
	controller: ReadableStreamDefaultController<UIMessageChunk>;
	messages: UIMessage[];
};

class ControlledTransport implements ChatTransport<UIMessage> {
	readonly requests = new Map<string, PendingRequest>();
	readonly aborted = new Set<string>();
	readonly requestCountByAssistant = new Map<string, number>();

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
			throw new Error("Test transport requires tree.assistantMessageId");
		}

		return Promise.resolve(
			new ReadableStream<UIMessageChunk>({
				start: (controller) => {
					this.requestCountByAssistant.set(
						assistantMessageId,
						(this.requestCountByAssistant.get(assistantMessageId) ?? 0) + 1,
					);
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
	for (let attempt = 0; attempt < 500; attempt += 1) {
		if (predicate()) {
			return;
		}
		await Bun.sleep(1);
	}
	throw new Error("Timed out waiting for integration state");
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

describe("integration: per-stream AbstractChat engines", () => {
	test("matches @ai-sdk/react Chat output for the same rich stream", async () => {
		const standardTransport = new ControlledTransport();
		const threadTransport = new ControlledTransport();
		const standardChat = new Chat<UIMessage>({
			generateId: () => "assistant-same",
			id: "chat-standard",
			transport: standardTransport,
		});
		const threadChat = new ThreadChat({
			id: "chat-thread",
			transport: threadTransport,
		});
		const input = userMessage("user-same", "Compare me");

		const standardPromise = standardChat.sendMessage(input, {
			body: { assistantMessageId: "assistant-same" },
		});
		const threadPromise = threadChat.sendMessage(input, {
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
		await threadPromise;

		expect(threadChat.getMessage("assistant-same")).toEqual(
			standardChat.messages.at(-1),
		);
	});

	test("keeps the reserved assistant identity and forwards data and tool callbacks", async () => {
		const transport = new ControlledTransport();
		const dataParts: unknown[] = [];
		const events: string[] = [];
		const finishedMessageIds: string[] = [];
		const finishedPaths: string[][] = [];
		const toolCalls: unknown[] = [];
		const chat = new ThreadChat({
			onData: (part) => dataParts.push(part),
			onFinish: ({ message, messages }) => {
				finishedMessageIds.push(message.id);
				finishedPaths.push(messages.map((item) => item.id));
			},
			onToolCall: ({ toolCall }) => {
				toolCalls.push(toolCall);
			},
			transport,
		});
		chat.subscribe(() => events.push(chat.getSnapshot().lastEvent));

		const runPromise = chat.sendMessage(userMessage("user-a", "A"), {
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
		await waitFor(
			() =>
				getMessageText(chat.getMessage("assistant-reserved") as UIMessage) ===
				"identity-safe",
		);
		events.length = 0;
		transport.finish("assistant-reserved");
		await runPromise;

		expect(chat.getMessage("server-tried-to-replace-id")).toBeUndefined();
		expect(finishedMessageIds).toEqual(["assistant-reserved"]);
		expect(finishedPaths).toEqual([["user-a", "assistant-reserved"]]);
		expect(events).not.toContain("Upserted assistant-reserved");
		expect(chat.getMessage("assistant-reserved")).toEqual(
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
		const chat = new ThreadChat({
			concurrency: { maxActiveRunsPerMessage: 1 },
			transport,
		});

		const runAPromise = chat.sendMessage(userMessage("user-a", "A"), {
			body: { assistantMessageId: "assistant-a" },
		});
		const runBPromise = chat.sendMessage(userMessage("user-b", "B"), {
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
		expect(chat.getSnapshot().activeRuns).toHaveLength(2);

		emitText(transport, "assistant-a", "text-a", "alpha");
		emitText(transport, "assistant-b", "text-b", "beta");
		await waitFor(
			() =>
				getMessageText(chat.getMessage("assistant-a") as UIMessage) ===
					"alpha" &&
				getMessageText(chat.getMessage("assistant-b") as UIMessage) === "beta",
		);

		chat.setCursor("user-b");
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
				getMessageText(chat.getMessage("assistant-a") as UIMessage) ===
					"alpha-hidden" &&
				getMessageText(chat.getMessage("assistant-b") as UIMessage) ===
					"beta-visible",
		);

		expect(chat.getSnapshot().cursorId).toBe("user-b");
		expect(chat.getPath("assistant-a").map((message) => message.id)).toEqual([
			"user-a",
			"assistant-a",
		]);
		expect(chat.getPath("assistant-b").map((message) => message.id)).toEqual([
			"user-b",
			"assistant-b",
		]);

		transport.finish("assistant-a");
		transport.finish("assistant-b");
		await Promise.all([runAPromise, runBPromise]);
	});

	test("stopping one branch does not abort another branch", async () => {
		const transport = new ControlledTransport();
		const chat = new ThreadChat({ transport });

		const runAPromise = chat.sendMessage(userMessage("user-a", "A"), {
			body: { assistantMessageId: "assistant-a" },
		});
		const runBPromise = chat.sendMessage(userMessage("user-b", "B"), {
			body: { assistantMessageId: "assistant-b" },
			tree: { follow: false, from: null },
		});
		await waitFor(() => transport.requests.size === 2);

		await chat.stopRun("assistant-a");
		await waitFor(() => transport.aborted.has("assistant-a"));
		expect(transport.aborted.has("assistant-b")).toBe(false);

		emitText(transport, "assistant-b", "text-b", "still-running");
		transport.finish("assistant-b");
		await Promise.all([runAPromise, runBPromise]);
		expect(getMessageText(chat.getMessage("assistant-b") as UIMessage)).toBe(
			"still-running",
		);
	});

	test("keeps selected-path status separate from aggregate run status", async () => {
		const transport = new ControlledTransport();
		const chat = new ThreadChat({ transport });
		const run = await chat.startRun({
			message: userMessage("user-a", "A"),
			request: { body: { assistantMessageId: "assistant-a" } },
		});
		await waitFor(() => transport.requests.has("assistant-a"));

		expect(chat.getSnapshot().status).toBe("submitted");
		expect(chat.getSnapshot().treeStatus).toBe("submitted");
		chat.setCursor("user-a");
		expect(chat.getSnapshot().status).toBe("ready");
		expect(chat.getSnapshot().treeStatus).toBe("submitted");

		transport.finish("assistant-a");
		await run.finished;
		expect(run.getSnapshot()?.status).toBe("ready");
	});

	test("routes tool output to the run that owns the tool call", async () => {
		const transport = new ControlledTransport();
		const chat = new ThreadChat({ transport });
		const runA = await chat.startRun({
			message: userMessage("user-a", "A"),
			request: { body: { assistantMessageId: "assistant-a" } },
		});
		const runB = await chat.startRun({
			follow: false,
			from: null,
			message: userMessage("user-b", "B"),
			request: { body: { assistantMessageId: "assistant-b" } },
		});
		await waitFor(() => transport.requests.size === 2);

		for (const [assistantMessageId, toolCallId] of [
			["assistant-a", "tool-a"],
			["assistant-b", "tool-b"],
		] as const) {
			transport.emit(assistantMessageId, {
				dynamic: true,
				input: { branch: assistantMessageId },
				toolCallId,
				toolName: "branch-tool",
				type: "tool-input-available",
			});
		}
		transport.emit("assistant-a", {
			approvalId: "approval-a",
			toolCallId: "tool-a",
			type: "tool-approval-request",
		});
		await waitFor(
			() =>
				chat.getMessage("assistant-a")?.parts.length === 1 &&
				chat.getMessage("assistant-b")?.parts.length === 1,
		);

		transport.finish("assistant-a");
		transport.finish("assistant-b");
		await Promise.all([runA.finished, runB.finished]);
		await chat.addToolApprovalResponse({
			approved: true,
			id: "approval-a",
		});
		expect(chat.getMessage("assistant-a")?.parts).toContainEqual(
			expect.objectContaining({
				approval: { approved: true, id: "approval-a", reason: undefined },
				state: "approval-responded",
				toolCallId: "tool-a",
			}),
		);

		await chat.addToolOutput({
			output: "A only",
			tool: "branch-tool",
			toolCallId: "tool-a",
		});

		expect(chat.getMessage("assistant-a")?.parts).toContainEqual(
			expect.objectContaining({ output: "A only", toolCallId: "tool-a" }),
		);
		expect(chat.getMessage("assistant-b")?.parts).toContainEqual(
			expect.not.objectContaining({ output: "A only" }),
		);
	});

	test("keeps automatic tool resubmission on the owning run", async () => {
		const transport = new ControlledTransport();
		const automaticChecks: string[][] = [];
		let didRequestFollowup = false;
		const chat = new ThreadChat({
			sendAutomaticallyWhen: ({ messages }) => {
				automaticChecks.push(
					messages
						.at(-1)
						?.parts.flatMap((part) =>
							"state" in part && typeof part.state === "string"
								? [part.state]
								: [],
						) ?? [],
				);
				const hasOutput =
					messages
						.at(-1)
						?.parts.some(
							(part) => "state" in part && part.state === "output-available",
						) ?? false;
				if (hasOutput && !didRequestFollowup) {
					didRequestFollowup = true;
					return true;
				}
				return false;
			},
			transport,
		});
		const run = await chat.startRun({
			message: userMessage("user-a", "A"),
			request: { body: { assistantMessageId: "assistant-a" } },
		});
		await waitFor(() => transport.requests.has("assistant-a"));
		transport.emit("assistant-a", {
			dynamic: true,
			input: { branch: "A" },
			toolCallId: "tool-a",
			toolName: "branch-tool",
			type: "tool-input-available",
		});
		transport.finish("assistant-a");
		await run.finished;

		await chat.addToolOutput({
			output: "continue",
			tool: "branch-tool",
			toolCallId: "tool-a",
		});
		await waitFor(() => automaticChecks.length >= 2);
		expect(automaticChecks).toContainEqual(["output-available"]);
		await waitFor(
			() => transport.requestCountByAssistant.get("assistant-a") === 2,
		);
		emitText(transport, "assistant-a", "text-2", "follow-up");
		transport.finish("assistant-a");
		await waitFor(() => chat.getRun("assistant-a")?.status === "ready");
		expect(chat.getSnapshot().activeRuns).toHaveLength(0);
	});
});

describe("integration: public readUIMessageStream reducer", () => {
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
