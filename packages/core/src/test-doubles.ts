import type { z } from "zod";

import type { Ask, Nemotron } from "./nemotron";

// A Nemotron that answers every prompt with `reply`, parsed by the caller's
// schema like the real one, and records what it was asked.
export const fakeNemotron = (reply: unknown) => {
  const asked: string[] = [];
  const ask: Nemotron = async <T extends z.ZodType>({
    name,
    schema,
  }: Ask<T>) => {
    asked.push(name);
    return await Promise.resolve(schema.parse(reply));
  };
  return { ask, asked };
};
