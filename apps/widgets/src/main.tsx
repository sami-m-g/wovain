import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// vite.config.ts points this at the WIDGET being built.
import { Widget } from "virtual:widget";

const root = document.querySelector("#root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <Widget />
    </StrictMode>
  );
}
