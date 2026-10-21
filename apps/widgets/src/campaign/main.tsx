import "../styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { CampaignWidget } from "./campaign-widget.tsx";

const root = document.querySelector("#root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <CampaignWidget />
    </StrictMode>
  );
}
