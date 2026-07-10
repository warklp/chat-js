"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
	type MessageTreeSnapshot,
	type ThreadConcurrency,
	ThreadRuntime,
	type TreeSendOptions,
} from "./runtime";

export type UseThreadOptions<TMessage extends UIMessage = UIMessage> =
	ConstructorParameters<typeof ThreadRuntime<TMessage>>[0] & {
		concurrency?: ThreadConcurrency;
		experimental_throttle?: number;
		initialTree?: MessageTreeSnapshot<TMessage>;
		resume?: boolean;
	};

export type TreeHelpers<TMessage extends UIMessage = UIMessage> = {
	childrenByParentId: Record<string, string[]>;
	cursorId: string | null;
	getChildren: (messageId: string | null) => TMessage[];
	getLeaves: (messageId?: string | null) => TMessage[];
	getMessage: (messageId: string) => TMessage | undefined;
	getParent: (messageId: string) => TMessage | undefined;
	getPath: (messageId?: string | null) => TMessage[];
	getSiblings: (messageId: string) => TMessage[];
	messagesById: Record<string, TMessage>;
	parentById: Record<string, string | null>;
	rootIds: string[];
	setCursor: (messageId: string | null) => void;
	setCursorToParentOf: (messageId: string) => void;
	stopAllStreams: () => void;
	stopStream: (streamId: string) => void;
	activeStreams: ReturnType<
		ThreadRuntime<TMessage>["getSnapshot"]
	>["activeStreams"];
	treeStatus: ReturnType<ThreadRuntime<TMessage>["getSnapshot"]>["treeStatus"];
};

export type UseThreadHelpers<TMessage extends UIMessage = UIMessage> =
	UseChatHelpers<TMessage> & {
		exportTree: () => MessageTreeSnapshot<TMessage>;
		lastEvent: string;
		sendMessage: (
			message?: Parameters<UseChatHelpers<TMessage>["sendMessage"]>[0],
			options?: TreeSendOptions,
		) => Promise<void>;
		tree: TreeHelpers<TMessage>;
	};

function useRuntimeSnapshot<TMessage extends UIMessage>(
	runtime: ThreadRuntime<TMessage>,
) {
	return useSyncExternalStore(
		runtime.subscribe,
		runtime.getSnapshot,
		runtime.getSnapshot,
	);
}

export function useThread<TMessage extends UIMessage = UIMessage>(
	options: UseThreadOptions<TMessage> = {},
): UseThreadHelpers<TMessage> {
	const runtimeRef = useRef<ThreadRuntime<TMessage> | null>(null);
	if (!runtimeRef.current) {
		runtimeRef.current = new ThreadRuntime(options);
	}

	const runtime = runtimeRef.current;
	const snapshot = useRuntimeSnapshot(runtime);
	const resumeRef = useRef(options.resume);

	useEffect(() => {
		if (!resumeRef.current) {
			return;
		}
		runtime.resumeStream();
	}, [runtime]);

	const setMessages = useCallback<UseChatHelpers<TMessage>["setMessages"]>(
		(messages) => runtime.setMessages(messages),
		[runtime],
	);

	return {
		addToolApprovalResponse: runtime.addToolApprovalResponse,
		addToolOutput: runtime.addToolOutput,
		addToolResult: runtime.addToolResult,
		clearError: runtime.clearError,
		error: snapshot.error,
		exportTree: () => runtime.exportTree(),
		id: runtime.chatId,
		lastEvent: snapshot.lastEvent,
		messages: snapshot.messages,
		regenerate: runtime.regenerate,
		resumeStream: runtime.resumeStream,
		sendMessage: runtime.sendMessage,
		setMessages,
		status: snapshot.status,
		stop: runtime.stop,
		tree: {
			childrenByParentId: snapshot.childrenByParentId,
			cursorId: snapshot.cursorId,
			getChildren: (messageId) => runtime.getChildren(messageId),
			getLeaves: (messageId) => runtime.getLeaves(messageId),
			getMessage: (messageId) => runtime.getMessage(messageId),
			getParent: (messageId) => runtime.getParent(messageId),
			getPath: (messageId) => runtime.getPath(messageId),
			getSiblings: (messageId) => runtime.getSiblings(messageId),
			messagesById: snapshot.messagesById,
			parentById: snapshot.parentById,
			rootIds: snapshot.rootIds,
			setCursor: (messageId) => runtime.setCursor(messageId),
			setCursorToParentOf: (messageId) =>
				runtime.setCursorToParentOf(messageId),
			stopAllStreams: () => runtime.stopAllStreams(),
			stopStream: (streamId) => runtime.stopStream(streamId),
			activeStreams: snapshot.activeStreams,
			treeStatus: snapshot.treeStatus,
		},
	};
}
