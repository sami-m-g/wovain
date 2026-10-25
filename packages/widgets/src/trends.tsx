import { Button } from "@wovain/ui/components/button";
import { z } from "zod";

import { mount, say } from "./bridge.tsx";

// research_trends: the ranked ideas with their evidence; "Design this" asks
// ChatGPT to run generate_design, which opens the design widget.

const ideasSchema = z.array(
  z.looseObject({
    id: z.string(),
    rank: z.number(),
    research: z.looseObject({
      moment: z.string().optional(),
      sources: z.array(z.object({ title: z.string(), url: z.url() })),
    }),
    score: z.number(),
    theme: z.string(),
  })
);

mount("trends", ideasSchema, ({ app, data }) => (
  <ol className="space-y-3 p-3">
    {data.map((idea) => (
      <li className="border-border space-y-1 border p-3" key={idea.id}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">
            {idea.rank}. {idea.theme}
          </h2>
          <span className="text-muted-foreground text-xs">
            score {Math.round(idea.score * 100)}
          </span>
        </div>
        {idea.research.moment !== undefined && (
          <p className="text-sm">{idea.research.moment}</p>
        )}
        <ul className="text-muted-foreground text-xs">
          {idea.research.sources.map((source) => (
            <li key={source.url}>
              <button
                className="underline"
                onClick={() => app.openLink({ url: source.url })}
                type="button"
              >
                {source.title}
              </button>
            </li>
          ))}
        </ul>
        <Button
          onClick={() =>
            say(
              app,
              `Generate a design for the "${idea.theme}" idea (ideaId ${idea.id}).`
            )
          }
          size="sm"
        >
          Design this
        </Button>
      </li>
    ))}
  </ol>
));
