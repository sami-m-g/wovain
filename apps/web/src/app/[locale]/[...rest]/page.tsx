import { notFound } from "next/navigation";

// Any unknown path under a locale renders the localized not-found page.
const CatchAllPage = () => {
  notFound();
};

export default CatchAllPage;
