// The sign-in and consent pages' styles, inlined into each page.
export const styles = `
:root {
  --wovain-accent: #3b4cca;
  --wovain-accent-text: #ffffff;
  --wovain-bg: #f7f7f8;
  --wovain-surface: #ffffff;
  --wovain-text: #1b1b1f;
  --wovain-muted: #5b5b66;
  --wovain-border: #e3e3e8;
  --wovain-danger: #b42318;
  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root {
    --wovain-accent: #7d8bff;
    --wovain-accent-text: #0e1030;
    --wovain-bg: #111114;
    --wovain-surface: #1b1b20;
    --wovain-text: #f2f2f5;
    --wovain-muted: #a4a4b0;
    --wovain-border: #2c2c34;
    --wovain-danger: #ff8a80;
  }
}

body {
  margin: 0;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--wovain-bg);
  color: var(--wovain-text);
  font:
    16px/1.5 system-ui,
    -apple-system,
    "Segoe UI",
    sans-serif;
}

.panel {
  width: min(100%, 26rem);
  padding: 32px;
  border: 1px solid var(--wovain-border);
  border-radius: 16px;
  background: var(--wovain-surface);
}

.panel h1 {
  margin: 0 0 8px;
  font-size: 1.375rem;
  line-height: 1.3;
}

.panel p {
  margin: 0 0 24px;
  color: var(--wovain-muted);
}

.panel [role="alert"] {
  margin: 16px 0 0;
  color: var(--wovain-danger);
}

.actions {
  display: flex;
  gap: 12px;
}

button {
  min-height: 44px;
  padding: 0 20px;
  border: 1px solid var(--wovain-border);
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

button.primary {
  width: 100%;
  border-color: var(--wovain-accent);
  background: var(--wovain-accent);
  color: var(--wovain-accent-text);
}

.actions button {
  flex: 1;
}

button:disabled {
  opacity: 0.6;
  cursor: progress;
}

button:focus-visible {
  outline: 2px solid var(--wovain-accent);
  outline-offset: 2px;
}
`;
