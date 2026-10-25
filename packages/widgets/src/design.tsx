import type { App } from "@modelcontextprotocol/ext-apps/react";
import { Button } from "@wovain/ui/components/button";
import { useState } from "react";
import { z } from "zod";

import { ActionError, callTool, mount, say, useAction } from "./bridge.tsx";

// generate_design and get_run: a gallery of designs with the judge's notes.
// Approve and reject are recorded right here; an approved design offers the
// next step.

const designSchema = z.looseObject({
  artworkUrl: z.url(),
  brief: z.looseObject({ description: z.string(), title: z.string() }),
  id: z.string(),
  judgment: z.looseObject({
    checks: z.array(
      z.object({ note: z.string(), pass: z.boolean(), rule: z.string() })
    ),
    coach: z.string(),
    score: z.number(),
    verdict: z.string(),
  }),
  status: z.string(),
});
type Design = z.infer<typeof designSchema>;

// One design, or a run with its designs.
const gallerySchema = z.union([
  designSchema.transform((design) => [design]),
  z
    .looseObject({ designs: z.array(designSchema) })
    .transform((run) => run.designs),
]);

const DesignCard = ({ app, design }: { app: App; design: Design }) => {
  const [status, setStatus] = useState(design.status);
  const { busy, failed, run } = useAction();
  const decide = (tool: "approve_design" | "reject_design") =>
    run(tool, async () => {
      const updated = await callTool(app, designSchema, tool, {
        designId: design.id,
      });
      setStatus(updated.status);
    });
  const { judgment } = design;
  return (
    <article className="border-border space-y-2 border p-3">
      <img
        alt={design.brief.title}
        className="bg-muted aspect-square w-full object-contain"
        src={design.artworkUrl}
      />
      <h2 className="font-semibold">{design.brief.title}</h2>
      <p className="text-sm">{design.brief.description}</p>
      <p className="text-muted-foreground text-xs">
        Judge: {judgment.verdict} · {judgment.score}/100 · {judgment.coach}
      </p>
      <ul className="text-xs">
        {judgment.checks.map((check) => (
          <li key={check.rule}>
            {check.pass ? "✓" : "✗"} {check.rule}: {check.note}
          </li>
        ))}
      </ul>
      {status === "pending_approval" ? (
        <div className="flex gap-2">
          <Button
            disabled={busy !== null}
            onClick={() => decide("approve_design")}
            size="sm"
          >
            Approve
          </Button>
          <Button
            disabled={busy !== null}
            onClick={() => decide("reject_design")}
            size="sm"
            variant="outline"
          >
            Reject
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <span className="capitalize">{status.replace("_", " ")}</span>
          {status === "approved" && (
            <Button
              onClick={() =>
                say(
                  app,
                  `Create the Fourthwall product for design ${design.id}.`
                )
              }
              size="sm"
            >
              Create product
            </Button>
          )}
        </div>
      )}
      <ActionError failed={failed} />
    </article>
  );
};

mount("design", gallerySchema, ({ app, data }) => (
  <div className="grid gap-3 p-3 sm:grid-cols-2">
    {data.map((design) => (
      <DesignCard app={app} design={design} key={design.id} />
    ))}
  </div>
));
