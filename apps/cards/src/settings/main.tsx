import "../styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { SettingsCard } from "./settings-card.tsx";

const root = document.querySelector("#root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <SettingsCard />
    </StrictMode>
  );
}
