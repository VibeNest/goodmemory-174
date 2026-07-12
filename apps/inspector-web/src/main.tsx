import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { createAdminClient } from "./api";
import { initializeInspectorToken } from "./auth";
import "./styles.css";

const token = initializeInspectorToken();
const root = createRoot(document.getElementById("root")!);

if (!token) {
  root.render(
    <main className="auth-state">
      <h1>Inspector token required</h1>
      <p>Start Inspector again and open the fragment-authenticated URL printed by the CLI.</p>
    </main>,
  );
} else {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: false, staleTime: 5_000 },
      mutations: { retry: false },
    },
  });
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App api={createAdminClient(token)} />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}
