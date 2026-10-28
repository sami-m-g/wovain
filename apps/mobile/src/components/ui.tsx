import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { isUnavailable } from "@/lib/format";
import { COLORS, RADIUS, SPACE } from "@/lib/theme";
import { MicSlot } from "@/voice/mic-slot";
import type { VoiceContext } from "@/voice/mic-slot";

const styles = StyleSheet.create({
  body: { color: COLORS.ink, fontSize: 15, lineHeight: 21 },
  button: {
    alignItems: "center",
    backgroundColor: COLORS.sunken,
    borderRadius: RADIUS,
    flexGrow: 1,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm + 4,
  },
  buttonInk: { color: COLORS.ink, fontSize: 15, fontWeight: "600" },
  buttonOn: { color: COLORS.onAccent, fontSize: 15, fontWeight: "600" },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.line,
    borderRadius: RADIUS,
    borderWidth: 1,
    gap: SPACE.sm,
    padding: SPACE.md,
  },
  content: { gap: SPACE.md, padding: SPACE.md, paddingBottom: SPACE.lg * 2 },
  danger: { backgroundColor: COLORS.danger },
  dim: { opacity: 0.6 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  heading: { color: COLORS.ink, fontSize: 17, fontWeight: "700" },
  muted: { color: COLORS.inkMuted, fontSize: 14, lineHeight: 20 },
  primary: { backgroundColor: COLORS.accent },
  row: { flexDirection: "row", gap: SPACE.sm },
  safe: { backgroundColor: COLORS.paper, flex: 1 },
  state: { marginTop: SPACE.lg },
  title: { color: COLORS.ink, fontSize: 28, fontWeight: "800" },
});

// The few building blocks every tab uses: a scrolling screen with a title
// and the mic slot, cards, buttons, and the loading, error and empty states.

// A query the screen reloads on pull-to-refresh.
interface Refreshable {
  isRefetching: boolean;
  refetch: () => Promise<unknown>;
}

const RefreshList = ({ query }: { query: Refreshable }) => {
  const handleRefresh = async () => {
    await query.refetch();
  };
  return (
    <RefreshControl onRefresh={handleRefresh} refreshing={query.isRefetching} />
  );
};

export const Screen = ({
  children,
  refresh,
  title,
  voice,
}: {
  children: ReactNode;
  refresh?: Refreshable;
  title: string;
  voice: VoiceContext;
}) => (
  <SafeAreaView edges={["top"]} style={styles.safe}>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <MicSlot {...voice} />
    </View>
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        refresh === undefined ? undefined : <RefreshList query={refresh} />
      }
    >
      {children}
    </ScrollView>
  </SafeAreaView>
);

export const Card = ({ children }: { children: ReactNode }) => (
  <View style={styles.card}>{children}</View>
);

export const Heading = ({ children }: { children: ReactNode }) => (
  <Text style={styles.heading}>{children}</Text>
);

export const Body = ({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) => <Text style={muted ? styles.muted : styles.body}>{children}</Text>;

export const Button = ({
  disabled = false,
  label,
  onPress,
  tone = "primary",
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  tone?: "danger" | "primary" | "secondary";
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.button,
      tone === "primary" && styles.primary,
      tone === "danger" && styles.danger,
      (pressed || disabled) && styles.dim,
    ]}
  >
    <Text style={tone === "secondary" ? styles.buttonInk : styles.buttonOn}>
      {label}
    </Text>
  </Pressable>
);

export const Row = ({ children }: { children: ReactNode }) => (
  <View style={styles.row}>{children}</View>
);

// Loading, failed (with what failed), unavailable (a flag is off) or empty.
export const QueryState = ({
  empty,
  error,
  isEmpty,
  isLoading,
}: {
  empty: string;
  error: unknown;
  isEmpty: boolean;
  isLoading: boolean;
}) => {
  if (isLoading) {
    return <ActivityIndicator color={COLORS.accent} style={styles.state} />;
  }
  if (error !== null && error !== undefined) {
    return (
      <Card>
        <Body muted>
          {isUnavailable(error)
            ? "This isn't available on your account yet."
            : `Couldn't load this: ${error instanceof Error ? error.message : String(error)}`}
        </Body>
      </Card>
    );
  }
  if (isEmpty) {
    return (
      <Card>
        <Body muted>{empty}</Body>
      </Card>
    );
  }
  return null;
};
