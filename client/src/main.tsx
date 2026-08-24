import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        const geminiKey = localStorage.getItem("buildplanner-gemini-key") || "";
        const openaiKey = localStorage.getItem("buildplanner-openai-key") || "";
        const anthropicKey = localStorage.getItem("buildplanner-anthropic-key") || "";
        const customModel = localStorage.getItem("buildplanner-custom-model") || "";
        const analysisLanguage = localStorage.getItem("buildplanner-analysis-language") || "";

        const headers = new Headers(init?.headers ?? {});
        if (geminiKey) headers.set("x-gemini-key", geminiKey);
        if (openaiKey) headers.set("x-openai-key", openaiKey);
        if (anthropicKey) headers.set("x-anthropic-key", anthropicKey);
        if (customModel) headers.set("x-custom-model", customModel);
        if (analysisLanguage) headers.set("x-analysis-language", analysisLanguage);

        return globalThis.fetch(input, {
          ...(init ?? {}),
          headers,
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
