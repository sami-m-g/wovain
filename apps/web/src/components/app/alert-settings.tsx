"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ALERT_CHANNELS, ALERT_TYPES } from "@wovain/core/alerts";
import type {
  AlertChannel,
  AlertSettings,
  AlertType,
} from "@wovain/core/alerts";
import { Button } from "@wovain/ui/components/button";
import { Checkbox } from "@wovain/ui/components/checkbox";
import { Input } from "@wovain/ui/components/input";
import { Label } from "@wovain/ui/components/label";
import { Switch } from "@wovain/ui/components/switch";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { orpc } from "@/utils/orpc";

/**
 * Settings > Alerts (openspec alerts): the channels each alert type goes
 * to, quiet hours that hold push and Telegram, and the Telegram and phone
 * links. Hidden while the alerts flag is off.
 */

const DEFAULT_QUIET = { end: "07:00", start: "22:00" };

const browserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const ChannelStatus = ({
  channels,
}: {
  channels: {
    email: string | null;
    push: { devices: number };
    telegram: {
      available: boolean;
      connected: boolean;
      username: string | null;
    };
  };
}) => {
  const t = useTranslations("Alerts.channels");
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: orpc.alerts.settings.key(),
    });
  };
  const connect = useMutation(orpc.alerts.connectTelegram.mutationOptions());
  // The window opens on the click itself, so Safari doesn't block it as a
  // popup; it gets the t.me link once the server answers.
  const openTelegram = () => {
    const opened = window.open("", "_blank");
    connect.mutate(
      {},
      {
        onError: () => {
          opened?.close();
        },
        onSuccess: ({ url }) => {
          if (opened === null) {
            window.location.assign(url);
            return;
          }
          opened.opener = null;
          opened.location.href = url;
        },
      }
    );
  };
  const disconnect = useMutation(
    orpc.alerts.disconnectTelegram.mutationOptions({ onSuccess: refresh })
  );
  const { telegram } = channels;

  return (
    <ul className="flex flex-col gap-3 text-sm">
      <li>
        <span className="font-medium">{t("email")}</span>{" "}
        <span className="text-muted-foreground">
          {channels.email ?? t("emailNone")}
        </span>
      </li>
      <li>
        <span className="font-medium">{t("push")}</span>{" "}
        <span className="text-muted-foreground">
          {channels.push.devices === 0
            ? t("pushNone")
            : t("pushDevices", { count: channels.push.devices })}
        </span>
      </li>
      <li className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t("telegram")}</span>
        {telegram.available ? null : (
          <span className="text-muted-foreground">
            {t("telegramUnavailable")}
          </span>
        )}
        {telegram.available && telegram.connected ? (
          <>
            <span className="text-muted-foreground">
              {telegram.username === null
                ? t("telegramConnected")
                : t("telegramConnectedAs", { username: telegram.username })}
            </span>
            <Button
              disabled={disconnect.isPending}
              onClick={() => {
                disconnect.mutate({});
              }}
              size="sm"
              variant="outline"
            >
              {t("telegramDisconnect")}
            </Button>
          </>
        ) : null}
        {telegram.available && !telegram.connected ? (
          <>
            <Button
              disabled={connect.isPending}
              onClick={openTelegram}
              size="sm"
            >
              {t("telegramConnect")}
            </Button>
            <Button onClick={refresh} size="sm" variant="ghost">
              {t("telegramCheck")}
            </Button>
          </>
        ) : null}
      </li>
      {connect.isError || disconnect.isError ? (
        <li className="text-destructive" role="alert">
          {t("telegramFailed")}
        </li>
      ) : null}
    </ul>
  );
};

const ChannelGrid = ({
  onChange,
  value,
}: {
  onChange: (type: AlertType, channel: AlertChannel, on: boolean) => void;
  value: AlertSettings["channels"];
}) => {
  const t = useTranslations("Alerts");
  return (
    <table className="w-full max-w-2xl text-sm">
      <caption className="sr-only">{t("gridCaption")}</caption>
      <thead>
        <tr className="text-muted-foreground text-left">
          <th className="py-2 font-normal" scope="col">
            {t("typeColumn")}
          </th>
          {ALERT_CHANNELS.map((channel) => (
            <th
              className="py-2 text-center font-normal"
              key={channel}
              scope="col"
            >
              {t(`channels.${channel}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ALERT_TYPES.map((type) => (
          <tr className="border-t" key={type}>
            <th className="py-3 pe-4 text-left font-normal" scope="row">
              <span className="font-medium">{t(`types.${type}.label`)}</span>
              <span className="text-muted-foreground block">
                {t(`types.${type}.hint`)}
              </span>
            </th>
            {ALERT_CHANNELS.map((channel) => (
              <td className="py-3 text-center" key={channel}>
                <Checkbox
                  aria-label={t("toggle", {
                    channel: t(`channels.${channel}`),
                    type: t(`types.${type}.label`),
                  })}
                  checked={value[type].includes(channel)}
                  className="mx-auto"
                  onCheckedChange={(checked) => {
                    onChange(type, channel, checked);
                  }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const QuietHoursField = ({
  onChange,
  value,
}: {
  onChange: (quiet: AlertSettings["quietHours"]) => void;
  value: AlertSettings["quietHours"];
}) => {
  const t = useTranslations("Alerts.quiet");
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="font-medium">{t("title")}</legend>
      <p className="text-muted-foreground max-w-[60ch] text-sm">{t("lead")}</p>
      <div className="flex items-center gap-2">
        <Switch
          checked={value !== null}
          id={`${id}-on`}
          onCheckedChange={(on) => {
            onChange(
              on ? { ...DEFAULT_QUIET, timeZone: browserTimeZone() } : null
            );
          }}
        />
        <Label htmlFor={`${id}-on`}>{t("on")}</Label>
      </div>
      {value === null ? null : (
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-start`}>{t("start")}</Label>
            <Input
              id={`${id}-start`}
              onChange={(event) => {
                onChange({ ...value, start: event.target.value });
              }}
              type="time"
              value={value.start}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-end`}>{t("end")}</Label>
            <Input
              id={`${id}-end`}
              onChange={(event) => {
                onChange({ ...value, end: event.target.value });
              }}
              type="time"
              value={value.end}
            />
          </div>
          <p className="text-muted-foreground text-sm">
            {t("timeZone", { timeZone: value.timeZone })}
          </p>
        </div>
      )}
    </fieldset>
  );
};

export const AlertSettingsPanel = () => {
  const t = useTranslations("Alerts");
  const queryClient = useQueryClient();
  const query = useQuery(orpc.alerts.settings.queryOptions());
  const [draft, setDraft] = useState<AlertSettings | null>(null);
  const save = useMutation(
    orpc.alerts.save.mutationOptions({
      onSuccess: async () => {
        setDraft(null);
        await queryClient.invalidateQueries({
          queryKey: orpc.alerts.settings.key(),
        });
      },
    })
  );

  const { data } = query;
  if (data === undefined) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>;
  }
  if (!data.on) {
    return <p className="text-muted-foreground text-sm">{t("off")}</p>;
  }
  const value = draft ?? data.settings;
  const toggle = (type: AlertType, channel: AlertChannel, on: boolean) => {
    const picked = new Set(value.channels[type]);
    if (on) {
      picked.add(channel);
    } else {
      picked.delete(channel);
    }
    setDraft({
      ...value,
      channels: {
        ...value.channels,
        [type]: ALERT_CHANNELS.filter((item) => picked.has(item)),
      },
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{t("channelsTitle")}</h2>
        <ChannelStatus channels={data.channels} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{t("gridTitle")}</h2>
        <ChannelGrid onChange={toggle} value={value.channels} />
      </section>
      <QuietHoursField
        onChange={(quietHours) => {
          setDraft({ ...value, quietHours });
        }}
        value={value.quietHours}
      />
      <div className="flex items-center gap-3">
        <Button
          disabled={draft === null || save.isPending}
          onClick={() => {
            save.mutate(value);
          }}
        >
          {t("save")}
        </Button>
        {save.isError ? (
          <p className="text-destructive text-sm" role="alert">
            {t("saveFailed")}
          </p>
        ) : null}
        {save.isSuccess && draft === null ? (
          <output className="text-muted-foreground text-sm">
            {t("saved")}
          </output>
        ) : null}
      </div>
    </div>
  );
};
