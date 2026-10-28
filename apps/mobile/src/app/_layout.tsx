import { QueryClientProvider } from "@tanstack/react-query";
import { useLastNotificationResponse } from "expo-notifications";
import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { authClient } from "@/lib/auth-client";
import { routeOf } from "@/lib/format";
import { queryClient } from "@/lib/orpc";
import { usePush } from "@/lib/session";
import { COLORS } from "@/lib/theme";

const styles = StyleSheet.create({
  splash: {
    alignItems: "center",
    backgroundColor: COLORS.paper,
    flex: 1,
    justifyContent: "center",
  },
});

// Opens the tab a tapped notification points at, once signed in.
const useNotificationRoute = (signedIn: boolean) => {
  const response = useLastNotificationResponse();
  useEffect(() => {
    if (signedIn && response !== null && response !== undefined) {
      router.navigate(routeOf(response.notification.request.content.data));
    }
  }, [response, signedIn]);
};

const Navigation = () => {
  const { data: session, isPending } = authClient.useSession();
  const signedIn = session !== null && session !== undefined;
  usePush(signedIn);
  useNotificationRoute(signedIn);

  if (isPending) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
};

const RootLayout = () => (
  <SafeAreaProvider>
    <QueryClientProvider client={queryClient}>
      <Navigation />
    </QueryClientProvider>
  </SafeAreaProvider>
);

export default RootLayout;
