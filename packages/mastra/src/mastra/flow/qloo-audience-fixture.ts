// What a campaign test needs now that no campaign stages without a Qloo
// audience (./audiences): a brand Qloo knows, a Qloo that keeps one
// audience for it (sneakerheads) and a Meta interest search that finds
// "Sneakers". Tests spread `qlooAudienceCore` into their fake core and save
// `QLOO_BRAND` in the brand profile.

export const QLOO_BRAND = {
  id: "B1",
  name: "Supreme",
  type: "urn:entity:brand",
};

export const qlooAudienceCore = {
  metaInterests: {
    search: async (query: string) =>
      await Promise.resolve(
        query === "Sneakers"
          ? [{ id: "6003000000010", name: "Sneakers", path: [] }]
          : []
      ),
  },
  qloo: {
    audienceAffinity: async (audienceId: string) =>
      await Promise.resolve(
        audienceId.endsWith("sneakerheads") ? [0.95] : [0.765]
      ),
    demographicsOf: async () => await Promise.resolve([]),
    searchEntities: async () => await Promise.resolve([]),
  },
};
