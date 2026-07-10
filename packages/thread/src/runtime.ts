import {
	AbstractChat,
	type ChatInit,
	type ChatRequestOptions,
	type ChatState,
	type ChatStatus,
	type ChatTransport,
	type CreateUIMessage,
	convertFileListToFileUIParts,
	DefaultChatTransport,
	generateId,
	type UIMessage,
} from "ai";

export const ROOT_PARENT_ID = "__root__";

export type TreeStream = {
	assistantMessageId: string;
	follow: boolean;
	originCursorId: string | null;
	parentMessageId: string | null;
	status: ChatStatus;
	streamId: string;
	userMessageId: string;
};

export type TreeSendOptions = ChatRequestOptions & {
	tree?: {
		follow?: boolean;
		from?: string | null;
		[key: string]: unknown;
	};
};

export type ThreadConcurrency = {
	maxActiveStreams?: number;
	maxActiveStreamsPerParent?: number;
};

export type MessageTreeSnapshot<TMessage extends UIMessage = UIMessage> = {
	childrenByParentId: Record<string, string[]>;
	cursorId: string | null;
	messagesById: Record<string, TMessage>;
	parentById: Record<string, string | null>;
	rootIds: string[];
	version: 1;
};

export type TreeStateSnapshot<TMessage extends UIMessage = UIMessage> =
	MessageTreeSnapshot<TMessage> & {
		error: Error | undefined;
		lastEvent: string;
		messages: TMessage[];
		status: ChatStatus;
		activeStreams: TreeStream[];
		storeVersion: number;
		treeStatus: ChatStatus;
	};

export type MessageTreeStore<TMessage extends UIMessage = UIMessage> = {
	addMessage: (message: TMessage, parentId: string | null) => void;
	exportTree: () => MessageTreeSnapshot<TMessage>;
	getChildren: (messageId: string | null) => TMessage[];
	getLeaves: (messageId?: string | null) => TMessage[];
	getMessage: (messageId: string) => TMessage | undefined;
	getParent: (messageId: string) => TMessage | undefined;
	getPath: (messageId?: string | null) => TMessage[];
	getSiblings: (messageId: string) => TMessage[];
	replacePath: (messages: TMessage[]) => void;
	setCursor: (messageId: string | null) => void;
	setCursorToParentOf: (messageId: string) => void;
	stopAllStreams: () => void;
	stopStream: (streamId: string) => void;
};

type StreamSpec = {
	assistantMessageId: string;
	follow: boolean;
	originCursorId: string | null;
	parentMessageId: string | null;
	streamId: string;
	userMessageId: string;
};

type StreamRecord<TMessage extends UIMessage> = {
	chat: TreeStreamChat<TMessage>;
	error: Error | undefined;
	spec: StreamSpec;
	status: ChatStatus;
};

function getAssistantMessageIdFromOptions(options?: TreeSendOptions) {
	const assistantMessageId = (
		options?.body as Record<string, unknown> | undefined
	)?.assistantMessageId;
	return typeof assistantMessageId === "string" ? assistantMessageId : null;
}

export type ThreadRuntimeOptions<TMessage extends UIMessage = UIMessage> = Omit<
	ChatInit<TMessage>,
	"messages"
> & {
	concurrency?: ThreadConcurrency;
	initialTree?: MessageTreeSnapshot<TMessage>;
	messages?: TMessage[];
};

type SendMessageInput<TMessage extends UIMessage> = Parameters<
	AbstractChat<TMessage>["sendMessage"]
>[0];

function getInputMessageId<TMessage extends UIMessage>(
	input: NonNullable<SendMessageInput<TMessage>>,
) {
	if ("id" in input && typeof input.id === "string") {
		return input.id;
	}
	return input.messageId;
}

function parentKey(parentId: string | null) {
	return parentId ?? ROOT_PARENT_ID;
}

function clone<T>(value: T): T {
	return structuredClone(value);
}

export function getMessageText(message: UIMessage) {
	return message.parts
		.map((part) => (part.type === "text" ? part.text : ""))
		.join("");
}

function createEmptyAssistantMessage<TMessage extends UIMessage>({
	id,
}: {
	id: string;
}): TMessage {
	return {
		id,
		parts: [],
		role: "assistant",
	} as unknown as TMessage;
}

async function createUserMessageFromInput<TMessage extends UIMessage>({
	fallbackId,
	input,
}: {
	fallbackId: string;
	input: NonNullable<SendMessageInput<TMessage>>;
}): Promise<TMessage> {
	const messageId = getInputMessageId(input) ?? fallbackId;
	const metadata = "metadata" in input ? input.metadata : undefined;

	if ("text" in input) {
		const fileParts =
			"files" in input && input.files
				? await convertFileListToFileUIParts(input.files as FileList)
				: [];

		return {
			id: messageId,
			metadata,
			parts: [{ text: input.text, type: "text" }, ...fileParts],
			role: "user",
		} as TMessage;
	}

	if ("files" in input && input.files) {
		return {
			id: messageId,
			metadata,
			parts: await convertFileListToFileUIParts(input.files as FileList),
			role: "user",
		} as TMessage;
	}

	return {
		...input,
		id: messageId,
		metadata,
		parts: "parts" in input ? input.parts : [],
		role: "user",
	} as TMessage;
}

class ThreadChatState<TMessage extends UIMessage>
	implements ChatState<TMessage>
{
	#error: Error | undefined;
	readonly #runtime: ThreadRuntime<TMessage>;
	readonly #spec: StreamSpec;
	#status: ChatStatus = "ready";

	constructor(runtime: ThreadRuntime<TMessage>, spec: StreamSpec) {
		this.#runtime = runtime;
		this.#spec = spec;
	}

	get error() {
		return this.#error;
	}

	set error(error: Error | undefined) {
		this.#error = error;
		this.#runtime.setStreamError(this.#spec.streamId, error);
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
		this.#runtime.mergePath(messages);
	}

	get status() {
		return this.#status;
	}

	set status(status: ChatStatus) {
		this.#status = status;
		this.#runtime.setStreamStatus(this.#spec.streamId, status);
	}

	popMessage = () => {
		const lastMessage = this.messages.at(-1);
		if (lastMessage) {
			this.#runtime.removeMessage(lastMessage.id);
		}
	};

	pushMessage = (message: TMessage) => {
		if (message.role === "assistant") {
			this.#runtime.markAssistantStarted(this.#spec.assistantMessageId);
			this.#runtime.upsertMessage(
				{ ...message, id: this.#spec.assistantMessageId },
				this.#spec.userMessageId,
			);
			return;
		}

		this.#runtime.upsertMessage(message, this.#spec.parentMessageId);
	};

	replaceMessage = (_index: number, message: TMessage) => {
		if (message.role === "assistant") {
			this.#runtime.markAssistantStarted(this.#spec.assistantMessageId);
			this.#runtime.upsertMessage(
				{ ...message, id: this.#spec.assistantMessageId },
				this.#spec.userMessageId,
			);
			return;
		}

		this.#runtime.upsertMessage(message, this.#spec.parentMessageId);
	};

	snapshot = <T>(thing: T): T => clone(thing);
}

class TreeStreamChat<
	TMessage extends UIMessage,
> extends AbstractChat<TMessage> {
	constructor(runtime: ThreadRuntime<TMessage>, spec: StreamSpec) {
		super({
			dataPartSchemas: runtime.dataPartSchemas,
			generateId: () => spec.assistantMessageId,
			id: runtime.chatId,
			messageMetadataSchema: runtime.messageMetadataSchema,
			onData: runtime.onData,
			onError: (error) => {
				runtime.setStreamError(spec.streamId, error);
				runtime.onError?.(error);
			},
			onFinish: (event) => {
				runtime.upsertMessage(
					{ ...event.message, id: spec.assistantMessageId },
					spec.userMessageId,
				);
				runtime.finishStream(spec.streamId, event.isAbort);
				runtime.onFinish?.(event);
			},
			onToolCall: runtime.onToolCall,
			sendAutomaticallyWhen: runtime.sendAutomaticallyWhen,
			state: new ThreadChatState(runtime, spec),
			transport: runtime.transport,
		});
	}
}

export class ThreadRuntime<TMessage extends UIMessage = UIMessage> {
	readonly chatId: string;
	readonly dataPartSchemas: ThreadRuntimeOptions<TMessage>["dataPartSchemas"];
	readonly generateMessageId: NonNullable<
		ThreadRuntimeOptions<TMessage>["generateId"]
	>;
	readonly messageMetadataSchema: ThreadRuntimeOptions<TMessage>["messageMetadataSchema"];
	readonly onData: ThreadRuntimeOptions<TMessage>["onData"];
	readonly onError: ThreadRuntimeOptions<TMessage>["onError"];
	readonly onFinish: ThreadRuntimeOptions<TMessage>["onFinish"];
	readonly onToolCall: ThreadRuntimeOptions<TMessage>["onToolCall"];
	readonly sendAutomaticallyWhen: ThreadRuntimeOptions<TMessage>["sendAutomaticallyWhen"];
	readonly transport: ChatTransport<TMessage>;

	readonly #assistantStarted = new Set<string>();
	readonly #childrenByParentId = new Map<string, string[]>();
	readonly #concurrency: Required<ThreadConcurrency>;
	readonly #listeners = new Set<() => void>();
	readonly #messagesById = new Map<string, TMessage>();
	readonly #parentById = new Map<string, string | null>();
	readonly #activeStreamsById = new Map<string, StreamRecord<TMessage>>();
	#cursorId: string | null = null;
	#lastEvent = "Ready";
	#snapshot: TreeStateSnapshot<TMessage>;
	#storeVersion = 0;

	constructor(options: ThreadRuntimeOptions<TMessage> = {}) {
		this.chatId = options.id ?? generateId();
		this.dataPartSchemas = options.dataPartSchemas;
		this.generateMessageId = options.generateId ?? generateId;
		this.messageMetadataSchema = options.messageMetadataSchema;
		this.onData = options.onData;
		this.onError = options.onError;
		this.onFinish = options.onFinish;
		this.onToolCall = options.onToolCall;
		this.sendAutomaticallyWhen = options.sendAutomaticallyWhen;
		this.transport = options.transport ?? new DefaultChatTransport();
		this.#concurrency = {
			maxActiveStreams:
				options.concurrency?.maxActiveStreams ?? Number.POSITIVE_INFINITY,
			maxActiveStreamsPerParent:
				options.concurrency?.maxActiveStreamsPerParent ??
				Number.POSITIVE_INFINITY,
		};

		if (options.initialTree) {
			this.restore(options.initialTree);
		} else if (options.messages) {
			this.replacePath(options.messages, { silent: true });
		}

		this.#snapshot = this.buildSnapshot();
	}

	getSnapshot = () => this.#snapshot;

	subscribe = (listener: () => void) => {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	};

	addMessage(message: TMessage, parentId: string | null) {
		this.upsertMessage(message, parentId);
	}

	clearError = () => {
		for (const stream of this.#activeStreamsById.values()) {
			stream.error = undefined;
			if (stream.status === "error") {
				stream.status = "ready";
			}
		}
		this.emit("Cleared errors");
	};

	addToolApprovalResponse: AbstractChat<TMessage>["addToolApprovalResponse"] =
		() => {
			throw new Error("Tool approval responses are not implemented yet");
		};

	addToolOutput: AbstractChat<TMessage>["addToolOutput"] = () => {
		throw new Error("Tool output handling is not implemented yet");
	};

	addToolResult: AbstractChat<TMessage>["addToolResult"] = () => {
		throw new Error("Tool result handling is not implemented yet");
	};

	exportTree(): MessageTreeSnapshot<TMessage> {
		const snapshot = this.buildSnapshot();
		return {
			childrenByParentId: snapshot.childrenByParentId,
			cursorId: snapshot.cursorId,
			messagesById: snapshot.messagesById,
			parentById: snapshot.parentById,
			rootIds: snapshot.rootIds,
			version: 1,
		};
	}

	finishStream(streamId: string, isAbort: boolean) {
		const stream = this.#activeStreamsById.get(streamId);
		this.#activeStreamsById.delete(streamId);
		if (stream) {
			this.#assistantStarted.delete(stream.spec.assistantMessageId);
		}
		this.emit(isAbort ? `Stopped ${streamId}` : `Finished ${streamId}`);
	}

	getChildren(messageId: string | null) {
		return (this.#childrenByParentId.get(parentKey(messageId)) ?? [])
			.map((id) => this.#messagesById.get(id))
			.filter((message): message is TMessage => Boolean(message))
			.map(clone);
	}

	getLeaves(messageId: string | null = null) {
		const leaves: TMessage[] = [];
		const visit = (id: string) => {
			const children = this.#childrenByParentId.get(parentKey(id)) ?? [];
			if (children.length === 0) {
				const message = this.#messagesById.get(id);
				if (message) {
					leaves.push(clone(message));
				}
				return;
			}

			for (const childId of children) {
				visit(childId);
			}
		};

		for (const child of this.#childrenByParentId.get(parentKey(messageId)) ??
			[]) {
			visit(child);
		}

		return leaves;
	}

	getMessage(messageId: string) {
		const message = this.#messagesById.get(messageId);
		return message ? clone(message) : undefined;
	}

	getParent(messageId: string) {
		const parentId = this.#parentById.get(messageId);
		return parentId ? this.getMessage(parentId) : undefined;
	}

	getPath(messageId: string | null | undefined = this.#cursorId) {
		if (!messageId) {
			return [];
		}

		return this.getPathIds(messageId)
			.map((id) => this.#messagesById.get(id))
			.filter((message): message is TMessage => Boolean(message))
			.map(clone);
	}

	getSiblings(messageId: string) {
		const parentId = this.#parentById.get(messageId);
		if (!this.#messagesById.has(messageId)) {
			return [];
		}
		return this.getChildren(parentId ?? null);
	}

	hasAssistantStarted(assistantMessageId: string) {
		return this.#assistantStarted.has(assistantMessageId);
	}

	markAssistantStarted(assistantMessageId: string) {
		this.#assistantStarted.add(assistantMessageId);
	}

	regenerate: AbstractChat<TMessage>["regenerate"] = ({
		messageId,
		...options
	} = {}) => {
		const target =
			(messageId ? this.#messagesById.get(messageId) : null) ??
			(this.#cursorId ? this.#messagesById.get(this.#cursorId) : null);
		if (!target) {
			return Promise.resolve();
		}

		const userMessageId =
			target.role === "assistant" ? this.#parentById.get(target.id) : target.id;
		if (!userMessageId) {
			return Promise.resolve();
		}

		this.startAssistantForUser({
			follow: true,
			originCursorId: target.id,
			options,
			parentMessageId: this.#parentById.get(userMessageId) ?? null,
			userMessageId,
		});
		return Promise.resolve();
	};

	removeMessage(messageId: string) {
		const parentId = this.#parentById.get(messageId);
		this.#messagesById.delete(messageId);
		this.#parentById.delete(messageId);
		const siblings =
			this.#childrenByParentId.get(parentKey(parentId ?? null)) ?? [];
		this.#childrenByParentId.set(
			parentKey(parentId ?? null),
			siblings.filter((id) => id !== messageId),
		);
		this.emit(`Removed ${messageId}`);
	}

	replacePath(messages: TMessage[], options: { silent?: boolean } = {}) {
		this.#childrenByParentId.clear();
		this.#messagesById.clear();
		this.#parentById.clear();

		let parentId: string | null = null;
		for (const message of messages) {
			this.upsertMessage(message, parentId, { silent: true });
			parentId = message.id;
		}

		this.#cursorId = messages.at(-1)?.id ?? null;
		if (!options.silent) {
			this.emit("Replaced active path");
		}
	}

	mergePath(messages: TMessage[], options: { silent?: boolean } = {}) {
		let parentId: string | null = null;
		for (const message of messages) {
			this.upsertMessage(message, parentId, { silent: true });
			parentId = message.id;
		}

		this.#cursorId = messages.at(-1)?.id ?? null;
		if (!options.silent) {
			this.emit("Merged active path");
		}
	}

	resumeStream: AbstractChat<TMessage>["resumeStream"] = (options = {}) => {
		const chat = this.createStreamChat({
			assistantMessageId: this.generateMessageId(),
			follow: true,
			originCursorId: this.#cursorId,
			parentMessageId: this.#cursorId,
			streamId: `stream:${this.generateMessageId()}`,
			userMessageId: this.#cursorId ?? "",
		});
		return chat.resumeStream(options);
	};

	restore(snapshot: MessageTreeSnapshot<TMessage>) {
		this.#childrenByParentId.clear();
		this.#messagesById.clear();
		this.#parentById.clear();

		for (const [id, message] of Object.entries(snapshot.messagesById)) {
			this.#messagesById.set(id, clone(message));
		}
		for (const [id, parentId] of Object.entries(snapshot.parentById)) {
			this.#parentById.set(id, parentId);
		}
		for (const [id, children] of Object.entries(snapshot.childrenByParentId)) {
			this.#childrenByParentId.set(id, [...children]);
		}
		this.#cursorId = snapshot.cursorId;
	}

	setCursor(messageId: string | null) {
		this.#cursorId = messageId;
		for (const stream of this.#activeStreamsById.values()) {
			stream.spec.follow = false;
		}
		this.emit(`Set cursor ${messageId ?? "root"}`);
	}

	setCursorToParentOf(messageId: string) {
		this.setCursor(this.#parentById.get(messageId) ?? null);
	}

	sendMessage = async (
		input?: SendMessageInput<TMessage>,
		options?: TreeSendOptions,
	) => {
		const originCursorId =
			options?.tree && "from" in options.tree
				? (options.tree.from ?? null)
				: this.#cursorId;
		const follow = options?.tree?.follow ?? originCursorId === this.#cursorId;

		if (!input) {
			const originMessage = originCursorId
				? this.#messagesById.get(originCursorId)
				: undefined;
			if (!originMessage || originMessage.role !== "user") {
				this.emit("Select a user message before sending without input");
				return;
			}

			this.startAssistantForUser({
				follow,
				options,
				originCursorId,
				parentMessageId: this.#parentById.get(originMessage.id) ?? null,
				userMessageId: originMessage.id,
			});
			return;
		}

		const userMessage = await createUserMessageFromInput({
			fallbackId: getInputMessageId(input) ?? this.generateMessageId(),
			input,
		});

		this.upsertMessage(userMessage, originCursorId, { silent: true });
		if (follow) {
			this.#cursorId = userMessage.id;
		}

		this.startAssistantForUser({
			follow,
			options,
			originCursorId,
			parentMessageId: originCursorId,
			userMessageId: userMessage.id,
		});
	};

	setMessages(messages: TMessage[] | ((messages: TMessage[]) => TMessage[])) {
		const nextMessages =
			typeof messages === "function"
				? messages(this.#snapshot.messages)
				: messages;
		this.mergePath(nextMessages);
	}

	setStreamError(streamId: string, error: Error | undefined) {
		const stream = this.#activeStreamsById.get(streamId);
		if (!stream) {
			return;
		}
		stream.error = error;
		stream.status = error ? "error" : stream.status;
		this.emit(error ? `Error in ${streamId}` : "Cleared error");
	}

	setStreamStatus(streamId: string, status: ChatStatus) {
		const stream = this.#activeStreamsById.get(streamId);
		if (!stream) {
			return;
		}
		stream.status = status;
		this.emit(`${streamId} is ${status}`);
	}

	stop: AbstractChat<TMessage>["stop"] = () => {
		const activeStream = Array.from(this.#activeStreamsById.values()).find(
			(stream) => stream.spec.assistantMessageId === this.#cursorId,
		);
		activeStream?.chat.stop();
		return Promise.resolve();
	};

	stopAllStreams() {
		for (const stream of this.#activeStreamsById.values()) {
			stream.chat.stop();
		}
	}

	stopStream(streamId: string) {
		this.#activeStreamsById.get(streamId)?.chat.stop();
	}

	upsertMessage(
		message: TMessage,
		parentId: string | null,
		options: { silent?: boolean } = {},
	) {
		const previousParentId = this.#parentById.get(message.id);
		this.#messagesById.set(message.id, clone(message));
		this.#parentById.set(message.id, parentId);

		if (previousParentId !== parentId) {
			if (previousParentId !== undefined) {
				const previousKey = parentKey(previousParentId);
				this.#childrenByParentId.set(
					previousKey,
					(this.#childrenByParentId.get(previousKey) ?? []).filter(
						(id) => id !== message.id,
					),
				);
			}

			const key = parentKey(parentId);
			const siblings = this.#childrenByParentId.get(key) ?? [];
			if (!siblings.includes(message.id)) {
				this.#childrenByParentId.set(key, [...siblings, message.id]);
			}
		}

		if (!options.silent) {
			this.emit(`Upserted ${message.id}`);
		}
	}

	private buildSnapshot(): TreeStateSnapshot<TMessage> {
		const messagesById = Object.fromEntries(
			Array.from(this.#messagesById.entries()).map(([id, message]) => [
				id,
				clone(message),
			]),
		);
		const parentById = Object.fromEntries(this.#parentById.entries());
		const childrenByParentId = Object.fromEntries(
			Array.from(this.#childrenByParentId.entries()).map(([id, children]) => [
				id,
				[...children],
			]),
		);
		const activeStreams = Array.from(this.#activeStreamsById.values()).map(
			({ spec, status }) => ({
				assistantMessageId: spec.assistantMessageId,
				follow: spec.follow,
				originCursorId: spec.originCursorId,
				parentMessageId: spec.parentMessageId,
				status,
				streamId: spec.streamId,
				userMessageId: spec.userMessageId,
			}),
		);
		const activeStream = Array.from(this.#activeStreamsById.values()).find(
			(stream) => stream.spec.assistantMessageId === this.#cursorId,
		);
		const error = activeStream?.error;

		return {
			childrenByParentId,
			cursorId: this.#cursorId,
			error,
			lastEvent: this.#lastEvent,
			messages: this.getPath(this.#cursorId),
			messagesById,
			parentById,
			rootIds: [...(this.#childrenByParentId.get(ROOT_PARENT_ID) ?? [])],
			status: activeStream
				? this.resolveStatus([activeStream], error)
				: "ready",
			storeVersion: this.#storeVersion,
			activeStreams,
			treeStatus: this.resolveStatus(
				Array.from(this.#activeStreamsById.values()),
			),
			version: 1,
		};
	}

	private canStartStream(parentMessageId: string | null) {
		if (this.#activeStreamsById.size >= this.#concurrency.maxActiveStreams) {
			this.emit("Blocked stream: max active streams reached");
			return false;
		}

		const activeStreamsFromParent = Array.from(
			this.#activeStreamsById.values(),
		).filter(
			(stream) => stream.spec.parentMessageId === parentMessageId,
		).length;
		if (
			activeStreamsFromParent >= this.#concurrency.maxActiveStreamsPerParent
		) {
			this.emit(
				`Blocked stream: max active streams for ${parentMessageId ?? "root"}`,
			);
			return false;
		}

		return true;
	}

	private createStreamChat(spec: StreamSpec) {
		return new TreeStreamChat(this, spec);
	}

	private emit(event: string) {
		this.#lastEvent = event;
		this.#storeVersion += 1;
		this.#snapshot = this.buildSnapshot();
		for (const listener of this.#listeners) {
			listener();
		}
	}

	private getPathIds(messageId: string) {
		const ids: string[] = [];
		let currentId: string | null = messageId;

		while (currentId) {
			if (!this.#messagesById.has(currentId)) {
				break;
			}
			ids.unshift(currentId);
			currentId = this.#parentById.get(currentId) ?? null;
		}

		return ids;
	}

	private resolveStatus(
		activeStreams: Array<Pick<StreamRecord<TMessage>, "error" | "status">>,
		error = activeStreams.find((stream) => stream.error)?.error,
	): ChatStatus {
		if (error) {
			return "error";
		}
		if (activeStreams.some((stream) => stream.status === "streaming")) {
			return "streaming";
		}
		if (activeStreams.some((stream) => stream.status === "submitted")) {
			return "submitted";
		}
		return "ready";
	}

	private startAssistantForUser({
		follow,
		options,
		originCursorId,
		parentMessageId,
		userMessageId,
	}: {
		follow: boolean;
		options?: TreeSendOptions;
		originCursorId: string | null;
		parentMessageId: string | null;
		userMessageId: string;
	}) {
		if (!this.canStartStream(userMessageId)) {
			return;
		}

		const assistantMessageId =
			getAssistantMessageIdFromOptions(options) ?? this.generateMessageId();
		const streamId = `stream:${assistantMessageId}`;
		const assistantShell = createEmptyAssistantMessage<TMessage>({
			id: assistantMessageId,
		});

		this.upsertMessage(assistantShell, userMessageId, { silent: true });
		if (follow) {
			this.#cursorId = assistantMessageId;
		}

		this.startStream({
			assistantMessageId,
			follow,
			options,
			originCursorId,
			parentMessageId,
			streamId,
			userMessageId,
		});
	}

	private startStream(
		specWithOptions: StreamSpec & { options?: TreeSendOptions },
	) {
		const { options, ...spec } = specWithOptions;
		const chat = this.createStreamChat(spec);

		this.#activeStreamsById.set(spec.streamId, {
			chat,
			error: undefined,
			spec,
			status: "submitted",
		});
		this.emit(`Started ${spec.streamId}`);

		const userMessage = this.#messagesById.get(spec.userMessageId);
		chat
			.sendMessage(userMessage as CreateUIMessage<TMessage>, {
				...options,
				body: {
					...options?.body,
					tree: {
						...options?.tree,
						assistantMessageId: spec.assistantMessageId,
						cursorId: this.#cursorId,
						originCursorId: spec.originCursorId,
						parentMessageId: spec.parentMessageId,
						pathIds: this.getPathIds(spec.userMessageId),
						streamId: spec.streamId,
						userMessageId: spec.userMessageId,
					},
				},
			})
			.catch((error: unknown) => {
				this.setStreamError(
					spec.streamId,
					error instanceof Error ? error : new Error(String(error)),
				);
			});
	}
}

export function createThreadRuntime<TMessage extends UIMessage = UIMessage>(
	options: ThreadRuntimeOptions<TMessage> = {},
) {
	return new ThreadRuntime(options);
}
