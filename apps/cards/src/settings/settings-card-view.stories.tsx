import { defaultSettings } from "@wovain/shared/settings";
import type { Settings } from "@wovain/shared/settings";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../.storybook/preview.tsx";
import { SettingsCardView } from "./settings-card-view.tsx";

const settings = defaultSettings();
const echo = async (next: Settings) => await Promise.resolve(next);

const meta = preview.meta({
  args: { onSave: fn(echo), settings },
  component: SettingsCardView,
  title: "Cards/Settings",
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
      await canvas.findByText("Saved. New cards use this right away.")
    ).toBeVisible();
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ campaign: { dailyBudgetPerProduct: 20 } })
    );
    await expect(canvas.getByText("$20 per product per day")).toBeVisible();
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

// Cheaper fal models for testing; the summary flags that they don't keep the print.
export const PicksTestVideoModel = meta.story({
  args: { initialState: { open: ["video"] } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: /H3 Turbo/u }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(
        /MiniMax H3 Max Turbo 720p · \$0\.24 per clip \(list price, Oct 19, 2026\) · test only/u
      )
    ).toBeVisible();
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        video: { ...settings.video, model: "h3-max-turbo" },
      })
    );
  },
});
