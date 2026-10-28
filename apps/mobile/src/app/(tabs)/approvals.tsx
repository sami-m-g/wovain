import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  Body,
  Button,
  Card,
  Heading,
  QueryState,
  Row,
  Screen,
} from "@/components/ui";
import { ago, cents } from "@/lib/format";
import { orpc, queryClient } from "@/lib/orpc";

// The one approval queue (store, media buying, autopilot): what an agent
// wants to do, why, what it costs, and approve or reject. Decisions go
// through approvals.decide, the same procedure as the website.

const DOMAIN_LABEL = {
  autopilot: "Autopilot",
  media: "Ads",
  store: "Store",
} as const;

const Approvals = () => {
  const list = useQuery(
    orpc.approvals.list.queryOptions({ input: { statuses: ["pending"] } })
  );
  const [failure, setFailure] = useState<string | undefined>();
  const decide = useMutation(
    orpc.approvals.decide.mutationOptions({
      onError: (error) => setFailure(error.message),
      onSuccess: async () => {
        setFailure(undefined);
        await queryClient.invalidateQueries({
          queryKey: orpc.approvals.key(),
        });
        await queryClient.invalidateQueries({ queryKey: orpc.inbox.key() });
      },
    })
  );
  const items = list.data ?? [];

  return (
    <Screen
      refresh={list}
      title="Approvals"
      voice={{ ids: items.map((item) => item.id), screen: "approvals" }}
    >
      {failure === undefined ? null : (
        <Card>
          <Body muted>{`That didn't go through: ${failure}`}</Body>
        </Card>
      )}
      <QueryState
        empty="Nothing waits for you. Agent actions that need your OK show up here."
        error={list.error}
        isEmpty={items.length === 0}
        isLoading={list.isLoading}
      />
      {items.map((item) => (
        <Card key={item.id}>
          <Body muted>
            {`${DOMAIN_LABEL[item.domain]} · ${item.risk} · ${ago(item.createdAt)}`}
          </Body>
          <Heading>{item.title}</Heading>
          {item.reason === null ? null : <Body>{item.reason}</Body>}
          {item.costPreview === null ? null : (
            <Body>
              {`${item.costPreview.label}: ${cents(item.costPreview.amountCents)}`}
            </Body>
          )}
          <Row>
            <Button
              disabled={decide.isPending}
              label="Approve"
              onPress={() =>
                decide.mutate({ approvalId: item.id, approve: true })
              }
            />
            <Button
              disabled={decide.isPending}
              label="Reject"
              onPress={() =>
                decide.mutate({ approvalId: item.id, approve: false })
              }
              tone="secondary"
            />
          </Row>
        </Card>
      ))}
    </Screen>
  );
};

export default Approvals;
