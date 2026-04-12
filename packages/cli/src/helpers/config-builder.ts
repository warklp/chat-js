import type { AuthProvider, FeatureKey, Gateway } from "../types";

const VALID_KEY_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

const DESCRIPTIONS = new Map<string, string>([
  ["features.attachments", "File attachments (requires BLOB_READ_WRITE_TOKEN)"],
  [
    "authentication.google",
    "Google OAuth (requires AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET)",
  ],
  [
    "authentication.github",
    "GitHub OAuth (requires AUTH_GITHUB_ID + AUTH_GITHUB_SECRET)",
  ],
  [
    "authentication.vercel",
    "Vercel OAuth (requires VERCEL_APP_CLIENT_ID + VERCEL_APP_CLIENT_SECRET)",
  ],
  [
    "paths.tools",
    "Import alias for the installable tools registry index and tool files",
  ],
]);

type GeneratedConfig = {
  appPrefix: string;
  appName: string;
  appDescription: string;
  appUrl: string;
  organization: {
    name: string;
    contact: {
      privacyEmail: string;
      legalEmail: string;
    };
  };
  services: {
    hosting: string;
    aiProviders: string[];
    paymentProcessors: string[];
  };
  features: Record<FeatureKey, boolean>;
  legal: {
    minimumAge: number;
    governingLaw: string;
    refundPolicy: string;
  };
  policies: {
    privacy: { title: string };
    terms: { title: string };
  };
  authentication: Record<AuthProvider, boolean>;
  desktopApp: {
    enabled: boolean;
  };
  ai: {
    gateway: Gateway;
  };
  paths: {
    tools: string;
  };
  anonymous: {
    credits: number;
    availableTools: never[];
    rateLimit: {
      requestsPerMinute: number;
      requestsPerMonth: number;
    };
  };
  attachments: {
    maxBytes: number;
    maxDimension: number;
    acceptedTypes: {
      "image/png": string[];
      "image/jpeg": string[];
      "application/pdf": string[];
    };
  };
};

const formatKey = (key: string) =>
  VALID_KEY_REGEX.test(key) ? key : JSON.stringify(key);

function formatValue(value: unknown, indent: number): string {
  const spaces = "  ".repeat(indent);
  const inner = "  ".repeat(indent + 1);

  if (value === null || value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every((v) => typeof v === "string")) {
      return `[${value.map((v) => JSON.stringify(v)).join(", ")}]`;
    }
    return `[\n${value
      .map((v) => `${inner}${formatValue(v, indent + 1)}`)
      .join(",\n")}\n${spaces}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return `{\n${entries
      .map(
        ([k, v]) => `${inner}${formatKey(k)}: ${formatValue(v, indent + 1)}`
      )
      .join(",\n")},\n${spaces}}`;
  }

  return String(value);
}

function generateConfig(
  obj: Record<string, unknown>,
  indent: number,
  pathPrefix: string
): string {
  const spaces = "  ".repeat(indent);

  return Object.entries(obj)
    .map(([key, value]) => {
      const path = pathPrefix ? `${pathPrefix}.${key}` : key;
      const desc = DESCRIPTIONS.get(path);
      const comment = desc ? ` // ${desc}` : "";

      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const nested = generateConfig(
          value as Record<string, unknown>,
          indent + 1,
          path
        );
        return `${spaces}${formatKey(key)}: {\n${nested}\n${spaces}},`;
      }

      return `${spaces}${formatKey(key)}: ${formatValue(
        value,
        indent
      )},${comment}`;
    })
    .join("\n");
}

export function buildConfigTs(input: {
  appName: string;
  appPrefix: string;
  appUrl: string;
  withElectron: boolean;
  gateway: Gateway;
  features: Record<FeatureKey, boolean>;
  auth: Record<AuthProvider, boolean>;
}): string {
  const fullConfig: GeneratedConfig = {
    appPrefix: input.appPrefix,
    appName: input.appName,
    appDescription: "AI chat powered by ChatJS",
    appUrl: input.appUrl,
    organization: {
      name: "Your Organization",
      contact: {
        privacyEmail: "privacy@your-domain.com",
        legalEmail: "legal@your-domain.com",
      },
    },
    services: {
      hosting: "Vercel",
      aiProviders: ["OpenAI", "Anthropic", "Google"],
      paymentProcessors: [],
    },
    features: input.features,
    legal: {
      minimumAge: 13,
      governingLaw: "United States",
      refundPolicy: "no-refunds",
    },
    policies: {
      privacy: { title: "Privacy Policy" },
      terms: { title: "Terms of Service" },
    },
    authentication: input.auth,
    desktopApp: {
      enabled: input.withElectron,
    },
    ai: { gateway: input.gateway },
    paths: {
      tools: "@/tools/chatjs",
    },
    anonymous: {
      credits: 10,
      availableTools: [],
      rateLimit: {
        requestsPerMinute: 5,
        requestsPerMonth: 10,
      },
    },
    attachments: {
      maxBytes: 1048576,
      maxDimension: 2048,
      acceptedTypes: {
        "image/png": [".png"],
        "image/jpeg": [".jpg", ".jpeg"],
        "application/pdf": [".pdf"],
      },
    },
  };

  return `import { defineConfig } from "@/lib/config-schema";

/**
 * ChatJS Configuration
 *
 * Edit this file to customize your app.
 * @see https://chatjs.dev/docs/reference/config
 */
const config = defineConfig({
${generateConfig(fullConfig, 1, "")}
});

export default config;
`;
}
