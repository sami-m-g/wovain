import { defaultSettings } from "@wovain/shared/settings";
import type { Settings } from "@wovain/shared/settings";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../.storybook/preview.tsx";
import { SettingsWidgetView } from "./settings-widget-view.tsx";

const settings = defaultSettings();
const echo = async (next: Settings) => await Promise.resolve(next);

const meta = preview.meta({
  args: { onSave: fn(echo), settings },
  component: SettingsWidgetView,
  title: "Widgets/Settings",
});

export const Closed = meta.story();

export const BudgetOpen = meta.story({
  args: { initialState: { open: ["budget"] } },
});

export const RulesOpen = meta.story({
  args: { initialState: { open: ["rules"] } },
});

export const MoreSettings = meta.story({
  args: { initialState: { open: ["more", "economics"] } },
});

export const InvalidValue = meta.story({
  args: {
    initialState: {
      draft: { ...settings, campaign: { dailyBudgetPerProduct: 0 } },
      open: ["budget"],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Must be at least 1")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  },
});

export const Saves = meta.story({
  args: { initialState: { open: ["budget"] } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const budget = canvas.getByLabelText("Daily budget per product");
    await userEvent.clear(budget);
    await userEvent.type(budget, "20");
    await expect(canvas.getByText("Unsaved changes.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Saved. New widgets use this right away.")
    ).toBeVisible();
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ campaign: { dailyBudgetPerProduct: 20 } })
    );
    await expect(canvas.getByText("$20.00 per product per day")).toBeVisible();
  },
});

export const SaveFails = meta.story({
  args: {
    initialState: { open: ["budget"] },
    onSave: fn(async (_next: Settings): Promise<Settings> => {
      await Promise.resolve();
      throw new Error("offline");
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const budget = canvas.getByLabelText("Daily budget per product");
    await userEvent.clear(budget);
    await userEvent.type(budget, "25");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(
        "Couldn’t save. Your edits are still here, so try again."
      )
    ).toBeVisible();
    await expect(budget).toHaveValue(25);
  },
});

// The reference model keeps the print without a start image, at a higher price.
export const PicksReferenceVideoModel = meta.story({
  args: { initialState: { open: ["video"] } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("radio", { name: /MiniMax H3 Max Reference/u })
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(
        /MiniMax H3 Max Reference 720p · \$0\.25 per clip \(list price, Oct 19, 2026; actual may be higher\)$/u
      )
    ).toBeVisible();
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        video: { ...settings.video, model: "h3-max-reference" },
      })
    );
  },
});
