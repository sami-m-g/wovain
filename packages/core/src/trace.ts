// The decision trace: every agent call and rule behind one decision (a
// run, a drop, an approval), in the order they finished, with the model,
// a short input summary, the output and the sources. Saved to the
// decision_trace table and shown as "why wovain did this".
//
// Adapted from CreatorPulse's Agent Trace (lib/trace.ts), MIT License,
// Copyright (c) 2026 Ruby Cheng: https://github.com/RubyCheng0419/creatorpulse-qloo
// Changes: entries carry the agent, model and sources; a sink persists
// them; failures are recorded and rethrown, never swallowed.

export type TraceProvider =
  | "fal"
  | "fourthwall"
  | "meta"
  | "nebius"
  | "qloo"
  | "rule"
  | "tavily";

export interface TraceSource {
  provider: TraceProvider;
  // A Qloo entity ID, a Meta ad ID …
  id?: string | undefined;
  title?: string | undefined;
  url?: string | undefined;
}

// What the trace is about. At least userId; the rest link it to its rows.
export interface TraceScope {
  userId: string;
  runId?: string | undefined;
  dropId?: string | undefined;
  approvalId?: string | undefined;
  suggestionId?: string | undefined;
}

export interface TraceEntry {
  // Order within the trace, from 0.
  seq: number;
  // The agent or component, e.g. "brief", "judge", "optimizer", "policy".
  agent: string;
  // The model ID it called, when it called one.
  model?: string | undefined;
  // The step inside the decision, e.g. "qloo.insights", "pick".
  step: string;
  // A short, PII-free summary of the input (cut to INPUT_SUMMARY_MAX).
  inputSummary: string;
  output: unknown;
  sources: TraceSource[];
  ok: boolean;
  // How long the call took.
  ms?: number | undefined;
  at: Date;
}

export type TraceSink = (
  scope: TraceScope,
  entries: TraceEntry[]
) => Promise<void>;

export const INPUT_SUMMARY_MAX = 500;

type EntryInput = Omit<
  TraceEntry,
  "seq" | "at" | "ok" | "sources" | "inputSummary"
> & {
  inputSummary: string;
  ok?: boolean | undefined;
  sources?: TraceSource[] | undefined;
};

type CallBase = Pick<EntryInput, "agent" | "model" | "step" | "inputSummary">;

type Described = Pick<EntryInput, "output"> &
  Partial<Pick<EntryInput, "ok" | "sources">>;

export class DecisionTrace {
  readonly scope: TraceScope;
  readonly entries: TraceEntry[] = [];
  private flushed = 0;
  private readonly sink: TraceSink | undefined;
  private readonly now: () => Date;

  constructor(
    scope: TraceScope,
    sink?: TraceSink,
    now: () => Date = () => new Date()
  ) {
    this.scope = scope;
    this.sink = sink;
    this.now = now;
  }

  add(entry: EntryInput): TraceEntry {
    const full: TraceEntry = {
      ...entry,
      at: this.now(),
      inputSummary: entry.inputSummary.slice(0, INPUT_SUMMARY_MAX),
      ok: entry.ok ?? true,
      seq: this.entries.length,
      sources: entry.sources ?? [],
    };
    this.entries.push(full);
    return full;
  }

  // Runs a call and records it with its duration. `describe` turns the
  // result into the entry; a failure is recorded too, then rethrown.
  async call<T>(
    base: CallBase,
    run: () => Promise<T>,
    describe: (result: T) => Described
  ): Promise<T> {
    const started = performance.now();
    const ms = () => Math.round(performance.now() - started);
    try {
      const result = await run();
      this.add({ ...base, ...describe(result), ms: ms() });
      return result;
    } catch (error) {
      this.add({
        ...base,
        ms: ms(),
        ok: false,
        output: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  // Saves the entries not saved yet. A sink failure propagates: the caller
  // logs it at error level.
  async flush(): Promise<void> {
    if (this.sink === undefined || this.flushed >= this.entries.length) {
      return;
    }
    const pending = this.entries.slice(this.flushed);
    await this.sink(this.scope, pending);
    this.flushed += pending.length;
  }
}
