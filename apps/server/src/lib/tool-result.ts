// A thrown error needs no wrapper: the MCP server returns its message as an
// isError result.
export const text = (value: string) => [{ text: value, type: "text" as const }];
