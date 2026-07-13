import {
	AbstractChat,
	type ChatState,
	type ChatStatus,
	type ChatTransport,
	type UIMessage,
} from "ai";
import type { ThreadRuntime } from "./thread-runtime";
import type { ThreadRunSpec } from "./types";

class ThreadChatState<TMessage extends UIMessage>
	implements ChatState<TMessage>
{
	#error: Error | undefined;
	readonly #runtime: ThreadRuntime<TMessage>;
	readonly #spec: ThreadRunSpec;
	#status: ChatStatus = "ready";

	constructor(runtime: ThreadRuntime<TMessage>, spec: ThreadRunSpec) {
		this.#runtime = runtime;
		this.#spec = spec;
	}

	get error() {
		return this.#error;
	}

	set error(error: Error | undefined) {
		this.#error = error;
		this.#runtime.setRunError(this.#spec.runId, error);
	}

	get messages() {
		const leafId = this.#runtime.hasAssistantStarted(
			this.#spec.assistantMessageId,
		)
			? this.#spec.assistantMessageId
			: this.#spec.userMessageId;
		return this.#runtime.getPath(leafId);
	}

	set messages(messages: TMessage[]) {
		this.#runtime.mergeRunPath(messages);
	}

	get status() {
		return this.#status;
	}

	set status(status: ChatStatus) {
		this.#status = status;
		this.#runtime.setRunStatus(this.#spec.runId, status);
	}

	popMessage = () => {
		const lastMessage = this.messages.at(-1);
		if (lastMessage) {
			this.#runtime.removeMessage(lastMessage.id);
		}
	};

	pushMessage = (message: TMessage) => {
		this.writeMessage(message);
	};

	replaceMessage = (_index: number, message: TMessage) => {
		this.writeMessage(message);
	};

	snapshot = <T>(thing: T): T => structuredClone(thing);

	private writeMessage(message: TMessage) {
		if (message.role === "assistant") {
			const assistantMessage = {
				...message,
				id: this.#spec.assistantMessageId,
			};
			this.#runtime.markAssistantStarted(this.#spec.assistantMessageId);
			this.#runtime.upsertMessage(assistantMessage, this.#spec.userMessageId);
			this.#runtime.indexMessageOwnership(this.#spec.runId, assistantMessage);
			return;
		}

		this.#runtime.upsertMessage(message, this.#spec.parentMessageId);
	}
}

export class ThreadRunChat<
	TMessage extends UIMessage,
> extends AbstractChat<TMessage> {
	constructor(runtime: ThreadRuntime<TMessage>, spec: ThreadRunSpec) {
		const transport: ChatTransport<TMessage> = {
			reconnectToStream: (options) =>
				runtime.transport.reconnectToStream(options),
			sendMessages: (options) => runtime.transport.sendMessages(options),
		};
		super({
			dataPartSchemas: runtime.dataPartSchemas,
			generateId: () => spec.assistantMessageId,
			id: runtime.chatId,
			messageMetadataSchema: runtime.messageMetadataSchema,
			onData: (event) => runtime.onData?.(event),
			onError: (error) => {
				runtime.setRunError(spec.runId, error);
				runtime.onError?.(error);
			},
			onFinish: (event) => {
				const assistantMessage = {
					...event.message,
					id: spec.assistantMessageId,
				};
				runtime.upsertMessage(assistantMessage, spec.userMessageId, {
					silent: true,
				});
				runtime.indexMessageOwnership(spec.runId, assistantMessage);
				runtime.finishRequest(spec.runId, event.isAbort);
				runtime.onFinish?.({
					...event,
					message: assistantMessage,
					messages: runtime.getPath(spec.assistantMessageId),
				});
			},
			onToolCall: async (event) => {
				runtime.registerToolCall(spec.runId, event.toolCall.toolCallId);
				await runtime.onToolCall?.(event);
			},
			sendAutomaticallyWhen: (event) =>
				runtime.sendAutomaticallyWhen?.(event) ?? false,
			state: new ThreadChatState(runtime, spec),
			transport,
		});
	}
}
