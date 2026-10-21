import "../styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { DesignWidget } from "./design-widget.tsx";

const root = document.querySelector("#root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <DesignWidget />
    </StrictMode>
  );
}
