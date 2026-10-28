import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Image, Pressable, StyleSheet } from "react-native";

import {
  Body,
  Button,
  Card,
  Heading,
  QueryState,
  Row,
  Screen,
} from "@/components/ui";
import { ago } from "@/lib/format";
import { orpc, queryClient } from "@/lib/orpc";
import { COLORS, RADIUS, SPACE } from "@/lib/theme";

const styles = StyleSheet.create({
  art: {
    aspectRatio: 1,
    backgroundColor: COLORS.sunken,
    borderRadius: RADIUS,
    width: "100%",
  },
  idea: {
    borderColor: COLORS.line,
    borderRadius: RADIUS,
    borderWidth: 1,
    gap: SPACE.xs,
    padding: SPACE.sm,
  },
  picked: { backgroundColor: COLORS.accentSoft, borderColor: COLORS.accent },
});

// Drops in progress: runs waiting at the ideas gate (pick which ideas to
// draw) and designs waiting for approval. Each decision goes through the
// website's procedures: runs.approveIdeas, designs.approve, designs.reject.

const refreshReview = async () => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.runs.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.ideas.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.designs.key() }),
  ]);
};

const IdeasGate = ({ runId, seed }: { runId: string; seed: string }) => {
  const ideas = useQuery(orpc.ideas.list.queryOptions({ input: { runId } }));
  const [picked, setPicked] = useState<string[]>([]);
  const approve = useMutation(
    orpc.runs.approveIdeas.mutationOptions({ onSuccess: refreshReview })
  );
  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  const items = ideas.data ?? [];

  return (
    <Card>
      <Body muted>Pick the ideas to design</Body>
      <Heading>{seed}</Heading>
      <QueryState
        empty="No ideas came back for this drop."
        error={ideas.error}
        isEmpty={items.length === 0}
        isLoading={ideas.isLoading}
      />
      {items.map((item) => (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: picked.includes(item.id) }}
          key={item.id}
          onPress={() => toggle(item.id)}
          style={[styles.idea, picked.includes(item.id) && styles.picked]}
        >
          <Heading>{item.theme}</Heading>
          {item.research.moment === undefined ? null : (
            <Body muted>{item.research.moment}</Body>
          )}
        </Pressable>
      ))}
      {approve.error === null ? null : (
        <Body muted>{`That didn't go through: ${approve.error.message}`}</Body>
      )}
      <Button
        disabled={picked.length === 0 || approve.isPending}
        label={
          picked.length === 1
            ? "Design 1 idea"
            : `Design ${picked.length} ideas`
        }
        onPress={() => approve.mutate({ id: runId, ideaIds: picked })}
      />
    </Card>
  );
};

const Review = () => {
  const runs = useQuery(orpc.runs.list.queryOptions());
  const designs = useQuery(orpc.designs.list.queryOptions({ input: {} }));
  const designOptions = { onSuccess: refreshReview };
  const approve = useMutation(
    orpc.designs.approve.mutationOptions(designOptions)
  );
  const reject = useMutation(
    orpc.designs.reject.mutationOptions(designOptions)
  );
  const busy = approve.isPending || reject.isPending;
  const failure = approve.error ?? reject.error;

  const atIdeas = (runs.data ?? []).filter(
    (run) => run.status === "awaiting_approval" && run.step === "ideas"
  );
  const pending = (designs.data ?? []).filter(
    (design) => design.status === "pending_approval"
  );
  const recent = (runs.data ?? []).slice(0, 5);

  return (
    <Screen
      refresh={runs}
      title="Review"
      voice={{
        ids: [...atIdeas.map((run) => run.id), ...pending.map((d) => d.id)],
        screen: "review",
      }}
    >
      <QueryState
        empty="No drops yet. Start one on wovain.com."
        error={runs.error ?? designs.error}
        isEmpty={recent.length === 0}
        isLoading={runs.isLoading || designs.isLoading}
      />
      {atIdeas.map((run) => (
        <IdeasGate key={run.id} runId={run.id} seed={run.seed} />
      ))}
      {failure === null ? null : (
        <Card>
          <Body muted>{`That didn't go through: ${failure.message}`}</Body>
        </Card>
      )}
      {pending.map((design) => (
        <Card key={design.id}>
          <Image
            accessibilityLabel="Design artwork"
            resizeMode="contain"
            source={{ uri: design.mockups[0] ?? design.artworkUrl }}
            style={styles.art}
          />
          <Body muted>
            {`Judge score ${design.judgment.score}/100 · ${ago(design.createdAt)}`}
          </Body>
          <Body>{design.judgment.coach}</Body>
          <Row>
            <Button
              disabled={busy}
              label="Approve"
              onPress={() => approve.mutate({ id: design.id })}
            />
            <Button
              disabled={busy}
              label="Reject"
              onPress={() => reject.mutate({ id: design.id })}
              tone="secondary"
            />
          </Row>
        </Card>
      ))}
      {recent.length > 0 ? <Heading>Recent drops</Heading> : null}
      {recent.map((run) => (
        <Card key={run.id}>
          <Heading>{run.seed}</Heading>
          <Body muted>
            {`${run.status.replace("_", " ")}${run.step === null ? "" : ` · ${run.step}`} · ${ago(run.createdAt)}`}
          </Body>
          {run.error === null ? null : <Body muted>{run.error}</Body>}
        </Card>
      ))}
    </Screen>
  );
};

export default Review;
