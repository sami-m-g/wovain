import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";

import {
  Body,
  Button,
  Card,
  Heading,
  QueryState,
  Screen,
} from "@/components/ui";
import { ago } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import { usePush } from "@/lib/session";

// What changed since the merchant last looked: the agents' new
// suggestions (trend, Qloo, performance) and how many approvals wait.

const PushStatus = () => {
  const push = usePush(true);
  if (push.error !== null) {
    return (
      <Card>
        <Body muted>
          {`Notifications couldn't be turned on: ${push.error.message}`}
        </Body>
      </Card>
    );
  }
  if (push.data?.status === "denied") {
    return (
      <Card>
        <Body muted>
          Notifications are off. Turn them on in Settings to hear about
          approvals as they come in.
        </Body>
      </Card>
    );
  }
  return null;
};

const Inbox = () => {
  const inbox = useQuery(orpc.inbox.list.queryOptions());
  const suggestions = inbox.data?.suggestions ?? [];
  const pending = inbox.data?.pendingApprovals ?? 0;

  return (
    <Screen
      refresh={inbox}
      title="Inbox"
      voice={{ ids: suggestions.map((item) => item.id), screen: "inbox" }}
    >
      <PushStatus />
      {pending > 0 ? (
        <Card>
          <Heading>
            {pending === 1
              ? "1 approval waits for you"
              : `${pending} approvals wait for you`}
          </Heading>
          <Button
            label="Review approvals"
            onPress={() => router.navigate("/approvals")}
          />
        </Card>
      ) : null}
      <QueryState
        empty="Nothing new. Suggestions from your agents show up here."
        error={inbox.error}
        isEmpty={suggestions.length === 0}
        isLoading={inbox.isLoading}
      />
      {suggestions.map((item) => (
        <Card key={item.id}>
          <Body muted>{`${item.trigger} · ${ago(item.createdAt)}`}</Body>
          <Heading>{item.title}</Heading>
          <Body>{item.rationale}</Body>
          {item.sources.length > 0 ? (
            <Body muted>
              {`Sources: ${item.sources
                .map((source) => source.title ?? source.provider)
                .join(", ")}`}
            </Body>
          ) : null}
          {item.runId === null ? null : (
            <Button
              label="Open in review"
              onPress={() => router.navigate("/review")}
              tone="secondary"
            />
          )}
        </Card>
      ))}
    </Screen>
  );
};

export default Inbox;
