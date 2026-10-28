import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet } from "react-native";

import { COLORS } from "@/lib/theme";

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: COLORS.sunken,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    opacity: 0.6,
    width: 44,
  },
});

// Where hold-to-talk goes (the voice-input workstream). Every tab renders
// this slot with what the screen shows, so "approve the first one" can be
// resolved against it. Until voice ships, the button is disabled.

type VoiceScreen = "approvals" | "inbox" | "kpis" | "review";

export interface VoiceContext {
  // What the screen lists, in display order.
  ids: string[];
  screen: VoiceScreen;
}

export const MicSlot = (_props: VoiceContext) => (
  <Pressable
    accessibilityLabel="Voice input is coming soon"
    accessibilityRole="button"
    accessibilityState={{ disabled: true }}
    disabled
    style={styles.button}
  >
    <SymbolView
      name={{ android: "mic", ios: "mic.fill", web: "mic" }}
      size={22}
      tintColor={COLORS.inkMuted}
    />
  </Pressable>
);
