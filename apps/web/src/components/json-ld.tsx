/** Structured data for search engines; `<` is escaped so the JSON can't close the script tag. */
export const JsonLd = ({ data }: { data: unknown }) => (
  <script
    // oxlint-disable-next-line react/no-danger -- JSON-LD must be inline JSON, escaped below
    dangerouslySetInnerHTML={{
      __html: JSON.stringify(data).replaceAll("<", "\\u003c"),
    }}
    type="application/ld+json"
  />
);
