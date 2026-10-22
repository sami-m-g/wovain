import { recordError } from "./request-errors.ts";

// A thrown error needs no wrapper: the MCP server returns its message as an
// isError result.
export const text = (value: string) => [{ text: value, type: "text" as const }];

// The reply of a tool whose key isn't set: the agent skips the step.
export const notConfigured = (message: string) => ({
  content: text(message),
  structuredContent: { configured: false },
});

// Logs the error class only: what the merchant sent and what the upstream
// replied (which SDKs put in their error messages) stay out of the logs. The
// request's route and status go with it (lib/request-errors.ts).
export const logErrorClass = (label: string, error: unknown) => {
  recordError(label, error);
};

// Runs an upstream call; a failure is logged by class and rethrown as one
// user-safe message.
export const userSafe = async <T>(
  label: string,
  message: string,
  run: () => Promise<T>
): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    logErrorClass(label, error);
    throw new Error(message, { cause: error });
  }
};
