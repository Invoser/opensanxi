#!/usr/bin/env node
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { PersonalApiClient } from "./personal-api-client.js";
import { registerPersonalAssistantTools } from "./tools.js";

function createServer(client: PersonalApiClient): McpServer {
  const server = new McpServer({
    name: "personal-assistant-mcp",
    version: "0.1.0"
  });

  registerPersonalAssistantTools(server, client);
  return server;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new PersonalApiClient(config);

  if (config.transport === "stdio") {
    const server = createServer(client);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return;
  }

  const httpServer = http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (!request.url?.startsWith(config.path)) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    try {
      const server = createServer(client);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
      });
      response.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "application/json" });
      }
      response.end(JSON.stringify({ error: message }));
    }
  });

  httpServer.listen(config.port, config.host, () => {
    console.error(`personal-assistant-mcp listening on http://${config.host}:${config.port}${config.path}`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
