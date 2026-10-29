// Where dictated words land in a text field: at the cursor, replacing any
// selection, within the field's length limit. The merchant edits the result
// before they submit; nothing is parsed or run.

export interface Insertion {
  // Where the caret goes: just after the inserted words.
  caret: number;
  value: string;
}

export const insertAtCursor = ({
  end,
  maxLength,
  start,
  text,
  value,
}: {
  end: number;
  maxLength?: number | undefined;
  start: number;
  text: string;
  value: string;
}): Insertion => {
  const from = Math.min(start, end, value.length);
  const to = Math.min(Math.max(start, end), value.length);
  const before = value.slice(0, from);
  const after = value.slice(to);
  // A space between words, never doubled and never leading.
  const lead = before === "" || /\s$/u.test(before) ? "" : " ";
  const trail = after === "" || /^\s/u.test(after) ? "" : " ";
  const room =
    maxLength === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, maxLength - before.length - after.length);
  const words = `${lead}${text.trim()}${trail}`.slice(0, room);
  return {
    caret: before.length + words.length,
    value: `${before}${words}${after}`,
  };
};
