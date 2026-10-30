"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wovain/ui/components/select";
import { useTranslations } from "next-intl";

import { MetaSetup } from "@/components/store/meta-setup";
import { orpc } from "@/utils/orpc";

/**
 * The Facebook Page the ads run as, with "Change Page" when the merchant
 * may advertise for more than one. The pick is kept for their next ads.
 * Nothing shows without a Page: the Meta setup card says how to get one.
 */
const CampaignPage = ({ title }: { title: string }) => {
  const t = useTranslations("Wizard.campaign");
  const queryClient = useQueryClient();
  const pages = useQuery({
    ...orpc.campaigns.pages.queryOptions(),
    retry: false,
  });
  const choose = useMutation(
    orpc.campaigns.choosePage.mutationOptions({
      onSuccess: (chosen) => {
        queryClient.setQueryData(orpc.campaigns.pages.queryKey(), chosen);
      },
    })
  );
  const current = pages.data?.pages.find(
    (page) => page.id === pages.data?.selected
  );
  if (pages.data === undefined || current === undefined) {
    return null;
  }
  const items = pages.data.pages.map((page) => ({
    label: page.name ?? page.id,
    value: page.id,
  }));
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-sm">
        {t("pageAs", { name: current.name ?? current.id })}
      </p>
      {items.length > 1 ? (
        <Select
          disabled={choose.isPending}
          items={items}
          onValueChange={(next) => {
            if (typeof next === "string" && next !== current.id) {
              choose.mutate({ pageId: next });
            }
          }}
          value={current.id}
        >
          <SelectTrigger aria-label={t("changePage")} className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : null}
      {choose.error === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          {choose.error.message}
        </p>
      )}
    </section>
  );
};

/**
 * Meta's side of the step: the setup cards while the account lacks what a
 * campaign needs, and the Page until the campaign is staged.
 */
export const CampaignMetaSetup = ({
  setup,
  staged,
  title,
}: {
  setup: boolean;
  staged: boolean;
  title: string;
}) => (
  <>
    {setup ? <MetaSetup /> : null}
    {staged ? null : <CampaignPage title={title} />}
  </>
);
