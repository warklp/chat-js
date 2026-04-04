declare global {
  interface ElectronAuthErrorContext {
    message?: string;
    path?: string;
    status?: number;
    statusText?: string;
  }

  interface ElectronRendererAuthState {
    detail?: string | null;
    message: string | null;
    status: "idle" | "awaiting-browser" | "finishing" | "timed-out" | "error";
  }

  interface Window {
    onAuthenticated?: (
      callback: (user: unknown) => void
    ) => () => void;
    onAuthError?: (
      callback: (context: ElectronAuthErrorContext) => void
    ) => () => void;
    onUserUpdated?: (
      callback: (user: unknown) => void
    ) => () => void;
    requestAuth?: (options?: { provider?: string }) => Promise<void> | void;
    signOut?: () => Promise<void>;
    electronAPI?: {
      getAuthState?: () => Promise<ElectronRendererAuthState>;
      isElectron: boolean;
      onAuthStateChanged?: (
        callback: (state: ElectronRendererAuthState) => void
      ) => () => void;
      platform: string;
      syncAuthSession?: () => Promise<void>;
      titlebarHeight: number;
    };
  }
}

export {};
