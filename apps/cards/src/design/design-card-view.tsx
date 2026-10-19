import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import {
  ArrowUp,
  Check,
  SettingsCog,
} from "@openai/apps-sdk-ui/components/Icon";
import { Input } from "@openai/apps-sdk-ui/components/Input";
import { printQuality } from "@wovain-foss/shared/design";
import type { Design } from "@wovain-foss/shared/design";
import { useEffect, useId, useState } from "react";

import { PricingSettings } from "./pricing-settings.tsx";
import type { PricingValues } from "./pricing-settings.tsx";

export interface DesignCardActions {
  // Posts "Approve design dN" so ChatGPT runs the Fourthwall publish.
  onApprove: (design: Design) => Promise<void>;
  onFeedback: (design: Design, feedback: string) => Promise<void>;
  // Asks ChatGPT to open the product in Fourthwall's designer.
  onOpenDesigner: (design: Design) => Promise<void>;
  onOpenLink: (url: string) => Promise<void>;
  // Saves the pricing settings, reprices and returns the updated design.
  onReprice: (design: Design, pricing: PricingValues) => Promise<Design>;
  onSkip: (design: Design) => Promise<Design>;
  // Reads the latest state while publishing runs in the chat.
  poll: (design: Design) => Promise<Design>;
}

export interface DesignCardViewProps extends DesignCardActions {
  design: Design;
  initialFeedback?: string | undefined;
  onFeedbackDraft?: (feedback: string) => void;
  pollMs?: number;
  pricing: PricingValues;
}

const MAX_REJECTIONS = 2;
const money = (value: number) => `$${value.toFixed(2)}`;

const statusBadge = (status: Design["status"]) => {
  if (status === "live") {
    return (
      <span className="wovain-status-live rounded-full px-2 py-0.5 text-xs font-medium">
        Live
      </span>
    );
  }
  if (status === "publishing") {
    return <Badge color="secondary">Publishing…</Badge>;
  }
  if (status === "skipped") {
    return <Badge color="secondary">Skipped</Badge>;
  }
  return null;
};

// Fourthwall returns badge codes (OUR_PICK, BESTSELLER); show them as words.
const badgeLabel = (badge: string) =>
  badge
    .split(/\s*·\s*|,\s*/u)
    .map((code) => code.trim().toLowerCase().replaceAll("_", " "))
    .filter((word) => word !== "")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" · ");

const Header = ({ design, titleId }: { design: Design; titleId: string }) => (
  <>
    <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <h2 className="heading-sm" id={titleId}>
        {design.idea}
      </h2>
      <span className="text-secondary text-sm">· {design.blank.name}</span>
      {design.blank.badge === undefined ? null : (
        <Badge color="secondary">{badgeLabel(design.blank.badge)}</Badge>
      )}
      <span className="ml-auto">{statusBadge(design.status)}</span>
    </header>
    <p className="text-secondary mt-1 text-sm">{design.coach}</p>
  </>
);

const splitSizes = (sizes: Design["sizes"]) => {
  const inStock: string[] = [];
  const outOfStock: string[] = [];
  for (const size of sizes) {
    (size.inStock ? inStock : outOfStock).push(size.size);
  }
  return { inStock, outOfStock };
};

const Sizes = ({ sizes }: { sizes: Design["sizes"] }) => {
  const { inStock, outOfStock } = splitSizes(sizes);
  const range =
    inStock.length > 1
      ? `${inStock[0]}–${inStock.at(-1)}`
      : (inStock[0] ?? "None in stock");
  return (
    <dd className="m-0">
      {range}
      {outOfStock.length === 0 ? null : (
        <span className="text-secondary">
          {" · "}
          {outOfStock.map((size) => (
            <s className="mr-1" key={size}>
              {size}
            </s>
          ))}
          out of stock, left off
        </span>
      )}
    </dd>
  );
};

const FileQuality = ({ artwork }: { artwork: Design["artwork"] }) =>
  printQuality(artwork) === "high" ? (
    <dd className="m-0 inline-flex items-center gap-1">
      {`${artwork.widthPx} px`}
      <Check aria-hidden className="text-success size-4" />
      print quality high
    </dd>
  ) : (
    <dd className="text-danger m-0">
      {`This artwork is ${artwork.widthPx} px, and this print size needs ${artwork.requiredPx} px or more, so it would print blurry.`}
    </dd>
  );

const Facts = ({
  color,
  design,
  onColor,
}: {
  color: string | undefined;
  design: Design;
  onColor: (name: string) => void;
}) => {
  const mockup =
    design.mockups.find((item) => item.color === color) ?? design.mockups[0];
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,13rem)_1fr]">
      <figure className="m-0">
        {mockup === undefined ? null : (
          <img
            alt={mockup.alt}
            className="border-subtle bg-surface-secondary aspect-[4/5] w-full rounded-xl border object-cover"
            height={260}
            src={mockup.url}
            width={208}
          />
        )}
      </figure>
      <dl className="m-0 grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-2 text-sm">
        <dt className="text-secondary">Colors</dt>
        <dd className="m-0 flex flex-wrap gap-1.5">
          {design.colors.map((item) => (
            <button
              aria-label={`${item.name}${item.inStock ? "" : " (out of stock)"}`}
              aria-pressed={item.name === color}
              className={`border-default size-6 rounded-full border disabled:opacity-40 ${item.name === color ? "outline-2 outline-offset-2 outline-[var(--wovain-accent-icon)]" : ""}`}
              disabled={!item.inStock}
              key={item.name}
              onClick={() => {
                onColor(item.name);
              }}
              style={{ background: item.hex }}
              title={item.name}
              type="button"
            />
          ))}
        </dd>
        <dt className="text-secondary">Print</dt>
        <dd className="m-0">
          {`${design.placement.area} · ${design.placement.style} · ${design.placement.printSize}`}
        </dd>
        <dt className="text-secondary">File</dt>
        <FileQuality artwork={design.artwork} />
        <dt className="text-secondary">Sizes</dt>
        <Sizes sizes={design.sizes} />
      </dl>
    </div>
  );
};

const Listing = ({
  design,
  onReprice,
  pricing,
}: {
  design: Design;
  onReprice: (pricing: PricingValues) => Promise<void>;
  pricing: PricingValues;
}) => {
  const [open, setOpen] = useState(false);
  const { quote } = design;
  const editable = design.status === "draft" || design.status === "rejected";
  return (
    <div className="border-subtle mt-4 grid gap-1.5 border-t pt-4 text-sm">
      <p className="m-0">
        <span className="text-secondary">Title </span>
        {design.listing.title}
      </p>
      <p className="m-0">
        <span className="text-secondary">Description </span>
        {design.listing.description}
      </p>
      <div className="flex items-center gap-2">
        <p className="m-0">
          <span className="font-semibold">{`$${quote.price.toFixed(0)}`}</span>
          <span className="text-secondary">
            {`  Base ${money(quote.baseCost)} → Profit ${money(quote.profit)} · ${Math.round(quote.marginPct)}% margin`}
          </span>
        </p>
        {editable ? (
          <button
            aria-expanded={open}
            aria-label="Pricing settings"
            className="text-secondary hover:text-default ml-auto rounded-md p-1"
            onClick={() => {
              setOpen(!open);
            }}
            type="button"
          >
            <SettingsCog aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
      {open ? (
        <PricingSettings
          onSave={async (values) => {
            await onReprice(values);
            setOpen(false);
          }}
          values={pricing}
        />
      ) : null}
    </div>
  );
};

type Busy = "approve" | "skip" | "feedback" | null;

const Actions = ({
  busy,
  design,
  feedback,
  onApprove,
  onFeedback,
  onFeedbackChange,
  onOpenDesigner,
  onSkip,
}: {
  busy: Busy;
  design: Design;
  feedback: string;
  onApprove: () => void;
  onFeedback: () => void;
  onFeedbackChange: (value: string) => void;
  onOpenDesigner: () => void;
  onSkip: () => void;
}) => {
  const id = useId();
  const publishing = design.status === "publishing";
  const locked = publishing || busy !== null;
  const lowQuality = printQuality(design.artwork) === "low";
  const primary =
    design.rejectCount >= MAX_REJECTIONS ? (
      <Button
        className="wovain-accent"
        color="primary"
        onClick={onOpenDesigner}
      >
        Open Fourthwall designer
      </Button>
    ) : (
      <Button
        className="wovain-accent"
        color="primary"
        disabled={lowQuality || locked}
        loading={publishing}
        onClick={onApprove}
      >
        {design.status === "rejected" ? "Try again" : "Approve"}
      </Button>
    );
  return (
    <div className="border-subtle mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
      {primary}
      <Button
        color="secondary"
        disabled={locked}
        loading={busy === "skip"}
        onClick={onSkip}
        variant="soft"
      >
        Skip
      </Button>
      <form
        className="min-w-48 flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          onFeedback();
        }}
      >
        <label className="sr-only" htmlFor={id}>
          Feedback on this design
        </label>
        <Input
          disabled={locked}
          endAdornment={
            <button
              aria-label="Send feedback"
              className="text-secondary hover:text-default disabled:opacity-40"
              disabled={feedback.trim() === "" || locked}
              type="submit"
            >
              <ArrowUp aria-hidden className="size-4" />
            </button>
          }
          id={id}
          onChange={(event) => {
            onFeedbackChange(event.target.value);
          }}
          placeholder="Feedback: what should change?"
          value={feedback}
        />
      </form>
    </div>
  );
};

const Rejection = ({ design }: { design: Design }) =>
  design.status === "rejected" ? (
    <p className="text-danger mt-3 text-sm" role="alert">
      {`Fourthwall didn't accept this product (${design.rejectReason ?? "no reason given"}). Your edits are saved.`}
      {design.rejectCount >= MAX_REJECTIONS
        ? " You can finish it in Fourthwall's designer."
        : ""}
    </p>
  ) : null;

const firstInStock = (design: Design) =>
  design.colors.find((item) => item.inStock)?.name ?? design.colors[0]?.name;

export const DesignCardView = ({
  design: initialDesign,
  initialFeedback,
  onApprove,
  onFeedback,
  onFeedbackDraft,
  onOpenDesigner,
  onOpenLink,
  onReprice,
  onSkip,
  poll,
  pollMs = 3000,
  pricing,
}: DesignCardViewProps) => {
  const titleId = useId();
  const [design, setDesign] = useState(initialDesign);
  const [color, setColor] = useState(() => firstInStock(initialDesign));
  const [feedback, setFeedback] = useState(initialFeedback ?? "");
  const [busy, setBusy] = useState<Busy>(null);

  // While Fourthwall publishes in the chat, follow the stored state.
  useEffect(() => {
    const refresh = async () => {
      setDesign(await poll(design));
    };
    const timer = setInterval(() => {
      if (design.status === "publishing") {
        void refresh();
      }
    }, pollMs);
    return () => {
      clearInterval(timer);
    };
  }, [design, poll, pollMs]);

  // Runs one card action; a failure returns the card to where it was.
  const run = async (kind: Busy, action: () => Promise<void>) => {
    const before = design;
    setBusy(kind);
    try {
      await action();
    } catch {
      setDesign(before);
    }
    setBusy(null);
  };

  const done = design.status === "live" || design.status === "skipped";

  return (
    <article aria-labelledby={titleId} className="p-4">
      <Header design={design} titleId={titleId} />
      <Facts color={color} design={design} onColor={setColor} />
      <Listing
        design={design}
        onReprice={async (values) => {
          setDesign(await onReprice(design, values));
        }}
        pricing={pricing}
      />
      <Rejection design={design} />
      {design.status === "live" && design.productUrl !== undefined ? (
        <div className="border-subtle mt-4 border-t pt-4">
          <Button
            className="wovain-accent"
            color="primary"
            onClick={() => {
              void onOpenLink(design.productUrl ?? "");
            }}
          >
            View in shop
          </Button>
        </div>
      ) : null}
      {done ? null : (
        <Actions
          busy={busy}
          design={design}
          feedback={feedback}
          onApprove={() => {
            void run("approve", async () => {
              setDesign({ ...design, status: "publishing" });
              await onApprove(design);
            });
          }}
          onFeedback={() => {
            const text = feedback.trim();
            if (text !== "") {
              void run("feedback", async () => {
                await onFeedback(design, text);
                setFeedback("");
                onFeedbackDraft?.("");
              });
            }
          }}
          onFeedbackChange={(value) => {
            setFeedback(value);
            onFeedbackDraft?.(value);
          }}
          onOpenDesigner={() => {
            void onOpenDesigner(design);
          }}
          onSkip={() => {
            void run("skip", async () => {
              setDesign(await onSkip(design));
            });
          }}
        />
      )}
    </article>
  );
};
