import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { dark } from "@clerk/themes";
import { registerSW } from "virtual:pwa-register";
import "./App.css";
import App from "./App";

// Register service worker — silently auto-updates in the background
registerSW({ immediate: false });

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary:    "#3b82f6",
          colorBackground: "#16191f",
          colorInputBackground: "#1e2128",
          colorInputText:  "#e2e8f0",
          borderRadius:    "8px",
          fontFamily:      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
        elements: {
          card:             "clerk-card",
          formButtonPrimary:"clerk-btn-primary",
        },
      }}
    >
      <App />
    </ClerkProvider>
  </StrictMode>
);
