import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import type { SymbolViewProps } from "expo-symbols";
import type { ColorValue } from "react-native";

import { COLORS } from "@/lib/theme";

const TabIcon = ({
  color,
  name,
}: {
  color: ColorValue;
  name: SymbolViewProps["name"];
}) => <SymbolView name={name} size={24} tintColor={color} />;

const inboxIcon = ({ color }: { color: ColorValue }) => (
  <TabIcon color={color} name={{ android: "inbox", ios: "tray.fill" }} />
);
const approvalsIcon = ({ color }: { color: ColorValue }) => (
  <TabIcon
    color={color}
    name={{ android: "verified", ios: "checkmark.seal.fill" }}
  />
);
const reviewIcon = ({ color }: { color: ColorValue }) => (
  <TabIcon
    color={color}
    name={{ android: "photo_library", ios: "photo.on.rectangle" }}
  />
);
const kpisIcon = ({ color }: { color: ColorValue }) => (
  <TabIcon
    color={color}
    name={{ android: "bar_chart", ios: "chart.bar.fill" }}
  />
);

const TabsLayout = () => (
  <Tabs
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: COLORS.accent,
      tabBarInactiveTintColor: COLORS.inkMuted,
      tabBarStyle: { backgroundColor: COLORS.surface },
    }}
  >
    <Tabs.Screen
      name="index"
      options={{
        tabBarIcon: inboxIcon,
        title: "Inbox",
      }}
    />
    <Tabs.Screen
      name="approvals"
      options={{
        tabBarIcon: approvalsIcon,
        title: "Approvals",
      }}
    />
    <Tabs.Screen
      name="review"
      options={{
        tabBarIcon: reviewIcon,
        title: "Review",
      }}
    />
    <Tabs.Screen
      name="kpis"
      options={{
        tabBarIcon: kpisIcon,
        title: "KPIs",
      }}
    />
  </Tabs>
);

export default TabsLayout;
