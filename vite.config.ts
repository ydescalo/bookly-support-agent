import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleAgentRequest } from "./server/agentHandler";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "bookly-agent-api",
      configureServer(server) {
        server.middlewares.use("/api/agent", (request, response) => {
          void handleAgentRequest(request, response);
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use("/api/agent", (request, response) => {
          void handleAgentRequest(request, response);
        });
      },
    },
  ],
});
