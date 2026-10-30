import type { z } from "zod";

import type { AgentId } from "./agents";
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

// A Nemotron that answers each agent from its own replies, in turn (the last
// reply repeats), and records each call's agent, images and prompt.
export const fakeAgents = (
  replies: Partial<Record<AgentId, readonly unknown[]>>
) => {
  const asked: { images: readonly string[]; name: AgentId; prompt: string }[] =
    [];
  const ask: Nemotron = async <T extends z.ZodType>({
    images = [],
    name,
    prompt,
    schema,
  }: Ask<T>) => {
    const turn = asked.filter((call) => call.name === name).length;
    asked.push({ images, name, prompt });
    const answers = replies[name] ?? [];
    const reply = answers[Math.min(turn, answers.length - 1)];
    if (reply === undefined) {
      throw new Error(`No fake reply for ${name}`);
    }
    return await Promise.resolve(schema.parse(reply));
  };
  return { ask, asked };
};
