import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Body, Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { reportError } from "@/lib/telemetry";
import { COLORS, RADIUS, SPACE } from "@/lib/theme";

const styles = StyleSheet.create({
  error: { color: COLORS.danger, fontSize: 14 },
  form: { flex: 1, gap: SPACE.md, justifyContent: "center", padding: SPACE.lg },
  input: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.line,
    borderRadius: RADIUS,
    borderWidth: 1,
    color: COLORS.ink,
    fontSize: 16,
    padding: SPACE.md,
  },
  safe: { backgroundColor: COLORS.paper, flex: 1 },
  title: { color: COLORS.ink, fontSize: 34, fontWeight: "800" },
});

// Runs a sign-in and answers what to show when it fails. A refused sign-in
// (wrong password, unverified email) comes back as result.error. A thrown
// one (offline, the browser flow failing) is reported to Error Tracking, and
// never leaves the buttons disabled.
const failureOf = async (
  attempt: () => Promise<{ error: unknown }>
): Promise<string | undefined> => {
  try {
    const result = await attempt();
    if (result.error === null || result.error === undefined) {
      return undefined;
    }
    const { message } = result.error as { message?: string };
    return message ?? "Sign-in failed. Try again.";
  } catch (error) {
    reportError(error, "sign-in");
    return "Couldn't reach wovain. Check your connection and try again.";
  }
};

// Sign-in with the website's accounts: email and password, or Google.
// New accounts are made on the website, which verifies the email first.
const SignIn = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const run = async (attempt: () => Promise<{ error: unknown }>) => {
    setBusy(true);
    setError(undefined);
    const failure = await failureOf(attempt);
    setBusy(false);
    setError(failure);
  };

  const withEmail = () =>
    run(async () => await authClient.signIn.email({ email, password }));
  const withGoogle = () =>
    run(
      async () =>
        await authClient.signIn.social({ callbackURL: "/", provider: "google" })
    );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.form}
      >
        <Text accessibilityRole="header" style={styles.title}>
          wovain
        </Text>
        <Body muted>
          Approve drops, designs and agent actions from your phone.
        </Body>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoComplete="email"
          inputMode="email"
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={COLORS.inkMuted}
          style={styles.input}
          value={email}
        />
        <TextInput
          accessibilityLabel="Password"
          autoComplete="current-password"
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={COLORS.inkMuted}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        {error === undefined ? null : <Text style={styles.error}>{error}</Text>}
        <View style={{ gap: SPACE.sm }}>
          <Button
            disabled={busy || email === "" || password === ""}
            label="Sign in"
            onPress={withEmail}
          />
          <Button
            disabled={busy}
            label="Continue with Google"
            onPress={withGoogle}
            tone="secondary"
          />
        </View>
        <Body muted>New here? Create your account on wovain.com first.</Body>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SignIn;
