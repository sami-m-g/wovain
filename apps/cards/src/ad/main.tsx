import "../styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AdCard } from "./ad-card.tsx";

const root = document.querySelector("#root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <AdCard />
    </StrictMode>
  );
}
