import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

// Create MCP server
const server = new McpServer({
  name: "mutual-funds-mcp-server",
  version: "1.0.0"
});

// Search mutual funds by name via mfapi.in
// Response shape: [{ schemeCode: number, schemeName: string }]
server.registerTool(
  "search_mutual_funds",
  {
    description:
      "Search Indian mutual fund schemes by name (e.g. 'Axis', 'HDFC Flexi Cap'). Returns matching schemes with their scheme codes.",
    inputSchema: {
      query: z.string().min(1).describe("Fund name or partial name to search for")
    }
  },
  async ({ query }) => {
    const url = `https://api.mfapi.in/mf/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });

    if (!res.ok) {
      return {
        isError: true,
        content: [{ type: "text", text: `mfapi.in search failed: HTTP ${res.status}` }]
      };
    }

    const schemes = await res.json();

    if (schemes.length === 0) {
      return { content: [{ type: "text", text: `No mutual funds found for "${query}".` }] };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(schemes, null, 2) }]
    };
  }
);

// Get NAV for a scheme via mfapi.in
// Response shape: { meta: {...}, data: [{ date: "DD-MM-YYYY", nav: "123.45" }] (newest first), status }
// An unknown scheme code still returns HTTP 200, with scheme_code 0 and empty data.
server.registerTool(
  "get_fund_nav",
  {
    description:
      "Get the NAV (net asset value) of an Indian mutual fund by scheme code (from search_mutual_funds). Returns scheme details and the most recent NAV entries, newest first.",
    inputSchema: {
      schemeCode: z.number().int().positive().describe("Scheme code, e.g. 113434"),
      count: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(1)
        .describe("Number of most recent NAV entries to return (default 1 = latest NAV)")
    }
  },
  async ({ schemeCode, count }) => {
    const url = `https://api.mfapi.in/mf/${schemeCode}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });

    if (!res.ok) {
      return {
        isError: true,
        content: [{ type: "text", text: `mfapi.in NAV lookup failed: HTTP ${res.status}` }]
      };
    }

    const { meta, data } = await res.json();

    if (!meta?.scheme_code || !data?.length) {
      return {
        isError: true,
        content: [{ type: "text", text: `No mutual fund found for scheme code ${schemeCode}.` }]
      };
    }

    const result = {
      ...meta,
      nav: data.slice(0, count)
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
);

// Get only the latest NAV for a scheme via mfapi.in
// Same response shape as /mf/{code}, but data holds just the newest entry.
server.registerTool(
  "get_latest_nav",
  {
    description:
      "Get the latest NAV (net asset value) of an Indian mutual fund by scheme code (from search_mutual_funds). Lighter than get_fund_nav when only the current NAV is needed.",
    inputSchema: {
      schemeCode: z.number().int().positive().describe("Scheme code, e.g. 113434")
    }
  },
  async ({ schemeCode }) => {
    const url = `https://api.mfapi.in/mf/${schemeCode}/latest`;
    const res = await fetch(url, { headers: { accept: "application/json" } });

    if (!res.ok) {
      return {
        isError: true,
        content: [{ type: "text", text: `mfapi.in latest NAV lookup failed: HTTP ${res.status}` }]
      };
    }

    const { meta, data } = await res.json();

    if (!meta?.scheme_code || !data?.length) {
      return {
        isError: true,
        content: [{ type: "text", text: `No mutual fund found for scheme code ${schemeCode}.` }]
      };
    }

    const result = {
      ...meta,
      date: data[0].date,
      nav: data[0].nav
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
);

// Start MCP server
await serveStdio(() => server);
