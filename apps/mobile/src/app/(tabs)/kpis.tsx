import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  Body,
  Button,
  Card,
  Heading,
  QueryState,
  Row,
  Screen,
} from "@/components/ui";
import { count, dollars, percent } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import { signOut } from "@/lib/session";
import { COLORS, SPACE } from "@/lib/theme";

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  label: { color: COLORS.inkMuted, fontSize: 13 },
  tile: { flexBasis: "47%", flexGrow: 1, gap: SPACE.xs },
  value: { color: COLORS.ink, fontSize: 24, fontWeight: "800" },
});

// The store pulse from insights.overview: Fourthwall sales and Meta ads for
// the range, the same numbers as the website's Insights page.

const RANGES = ["7d", "28d", "90d"] as const;
type Range = (typeof RANGES)[number];

const Tile = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.tile}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{value}</Text>
  </View>
);

const Account = () => {
  const out = useMutation({ mutationFn: signOut });
  return (
    <Card>
      <Heading>Account</Heading>
      {out.error === null ? null : (
        <Body muted>{`Sign-out failed: ${out.error.message}`}</Body>
      )}
      <Button
        disabled={out.isPending}
        label="Sign out"
        onPress={() => out.mutate()}
        tone="secondary"
      />
    </Card>
  );
};

const Kpis = () => {
  const [range, setRange] = useState<Range>("7d");
  const insights = useQuery(
    orpc.insights.overview.queryOptions({ input: { range } })
  );
  const shop = insights.data?.shop;
  const ads = insights.data?.ads;

  return (
    <Screen
      refresh={insights}
      title="KPIs"
      voice={{ ids: [range], screen: "kpis" }}
    >
      <Row>
        {RANGES.map((item) => (
          <Button
            key={item}
            label={item}
            onPress={() => setRange(item)}
            tone={item === range ? "primary" : "secondary"}
          />
        ))}
      </Row>
      <QueryState
        empty=""
        error={insights.error}
        isEmpty={false}
        isLoading={insights.isLoading}
      />
      {shop === undefined ? null : (
        <Card>
          <Heading>Store</Heading>
          {shop.status === "ok" ? (
            <View style={styles.grid}>
              <Tile label="Revenue" value={dollars(shop.totals.revenue)} />
              <Tile label="Profit" value={dollars(shop.totals.profit)} />
              <Tile label="Orders" value={count(shop.totals.orders)} />
            </View>
          ) : (
            <Body muted>
              {shop.status === "not_connected"
                ? "Connect Fourthwall on wovain.com to see sales."
                : `Sales are unavailable right now: ${shop.message}`}
            </Body>
          )}
        </Card>
      )}
      {ads === undefined ? null : (
        <Card>
          <Heading>Ads</Heading>
          {ads.status === "ok" ? (
            <View style={styles.grid}>
              <Tile label="Spend" value={dollars(ads.totals.spend)} />
              <Tile label="Clicks" value={count(ads.totals.clicks)} />
              <Tile label="CTR" value={percent(ads.totals.ctr)} />
              <Tile
                label="ROAS"
                value={
                  ads.totals.roas === undefined
                    ? "–"
                    : `${ads.totals.roas.toFixed(2)}x`
                }
              />
            </View>
          ) : (
            <Body muted>
              {ads.status === "not_connected"
                ? "Connect Meta on wovain.com to see ads."
                : `Ads are unavailable right now: ${ads.message}`}
            </Body>
          )}
        </Card>
      )}
      <Account />
    </Screen>
  );
};

export default Kpis;
