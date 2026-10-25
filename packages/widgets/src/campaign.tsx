import { Button } from "@wovain/ui/components/button";
import { z } from "zod";

import { mount } from "./bridge.tsx";

// create_campaign: the paused campaign's budget and its ad variants, with a
// link to review and start it in Ads Manager.

const campaignSchema = z.looseObject({
  adAccountId: z.string(),
  copy: z.array(
    z.object({ angle: z.string(), headline: z.string(), message: z.string() })
  ),
  dailyBudgetCents: z.number(),
  metaCampaignId: z.string(),
  status: z.string(),
});

mount("campaign", campaignSchema, ({ app, data }) => (
  <article className="space-y-3 p-3">
    <div className="flex items-center justify-between text-sm">
      <span className="font-semibold">
        ${(data.dailyBudgetCents / 100).toFixed(2)} a day
      </span>
      <span className="bg-muted px-2 py-0.5 text-xs uppercase">
        {data.status}
      </span>
    </div>
    <ul className="space-y-2">
      {data.copy.map((ad) => (
        <li className="border-border border p-2" key={ad.angle}>
          <p className="text-muted-foreground text-xs uppercase">{ad.angle}</p>
          <p className="font-medium">{ad.headline}</p>
          <p className="text-sm">{ad.message}</p>
        </li>
      ))}
    </ul>
    <Button
      onClick={() =>
        app.openLink({
          url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${data.adAccountId}&selected_campaign_ids=${data.metaCampaignId}`,
        })
      }
      size="sm"
      variant="outline"
    >
      Review in Ads Manager
    </Button>
  </article>
));
