import type {
  CodeExecutionContext,
  CodeExecutionResult,
} from "./code-execution.types";

const EXECUTION_STATUS_PREFIX = "__EXECUTION_STATUS__:";

function createWrappedCode(code: string): string {
  return `
import { inspect } from "node:util";

const __formatOutput = (value) => {
  if (typeof value === "string") {
    return value;
  }

  return inspect(value, {
    depth: 4,
    colors: false,
    maxArrayLength: 100,
    breakLength: 120,
  });
};

const __run = async () => {
  try {
    const __execution = await (async () => {
      let result;
      let results;

${code
  .split("\n")
  .map((line) => `      ${line}`)
  .join("\n")}
      return { __kind: "locals", result, results };
    })();

    const __result =
      __execution &&
      typeof __execution === "object" &&
      __execution.__kind === "locals"
        ? typeof __execution.result !== "undefined"
          ? __execution.result
          : typeof __execution.results !== "undefined"
            ? __execution.results
            : undefined
        : __execution;

    if (typeof __result !== "undefined") {
      console.log(__formatOutput(__result));
    }

    console.log("${EXECUTION_STATUS_PREFIX}" + JSON.stringify({ success: true }));
  } catch (error) {
    const execError = error instanceof Error ? error : new Error(String(error));
    console.log(
      "${EXECUTION_STATUS_PREFIX}" +
        JSON.stringify({
          success: false,
          error: {
            name: execError.name,
            value: execError.message,
            traceback: execError.stack ?? execError.message,
          },
        })
    );
    process.exitCode = 1;
  }
};

await __run();
`;
}

async function parseExecutionOutput(execResult: {
  stdout: () => Promise<string>;
}): Promise<{
  outputText: string;
  execInfo: {
    success: boolean;
    error?: { name: string; value: string; traceback: string };
  };
}> {
  const stdout = await execResult.stdout();
  const lines = (stdout ?? "").split("\n");
  const statusLineIndex = lines.findIndex((line) =>
    line.startsWith(EXECUTION_STATUS_PREFIX)
  );

  if (statusLineIndex === -1) {
    return {
      outputText: stdout ?? "",
      execInfo: { success: true },
    };
  }

  const execInfoRaw = lines[statusLineIndex].slice(
    EXECUTION_STATUS_PREFIX.length
  );
  const execInfo = JSON.parse(execInfoRaw) as {
    success: boolean;
    error?: { name: string; value: string; traceback: string };
  };
  lines.splice(statusLineIndex, 1);

  return {
    outputText: lines.join("\n").trim(),
    execInfo,
  };
}

export async function executeJavaScriptInSandbox({
  sandbox,
  code,
  log,
  requestId,
}: CodeExecutionContext): Promise<CodeExecutionResult> {
  const execResult = await sandbox.runCommand({
    cmd: "node",
    args: ["--input-type=module", "-e", createWrappedCode(code)],
  });

  const { outputText, execInfo } = await parseExecutionOutput(execResult);
  const stderr = await execResult.stderr();
  let message = "";

  if (outputText) {
    message += `${outputText}\n`;
  }
  if (stderr && stderr.trim().length > 0) {
    message += `${stderr}\n`;
  }
  if (execInfo.error) {
    message += `Error: ${execInfo.error.name}: ${execInfo.error.value}\n`;
    log.error(
      { requestId, error: execInfo.error },
      "javascript execution error"
    );
  }

  return {
    message: message.trim(),
    chart: "",
  };
}
