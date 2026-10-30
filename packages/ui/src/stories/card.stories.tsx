import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "@wovain/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wovain/ui/components/card";

const meta = {
  component: Card,
  title: "UI/Card",
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithBadge: Story = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Moss-dyed workwear</CardTitle>
        <CardDescription>Score 0.82</CardDescription>
      </CardHeader>
      <CardContent>
        <Badge variant="secondary">Design ready</Badge>
      </CardContent>
    </Card>
  ),
};
