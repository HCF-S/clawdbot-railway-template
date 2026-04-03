#!/usr/bin/env node

/**
 * Generative UI — MCP stdio server
 *
 * Exposes display tools that the agent calls to render rich cards in the chat
 * UI. Every tool is a pass-through: the agent provides the data in the
 * arguments and the server echoes it back as the result so the frontend can
 * render the matching card component.
 */

import { createInterface } from "node:readline";

const TOOLS = [
  {
    name: "show_profile",
    description:
      "Display a rich profile card. Use when presenting a user, twin, or friend's information.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name" },
        username: { type: "string", description: "Username or handle" },
        avatar_url: { type: "string", description: "Avatar image URL" },
        bio: { type: "string", description: "Short bio" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Interest or skill tags (max 5 shown)",
        },
        stats: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: ["string", "number"] },
            },
            required: ["label", "value"],
          },
          description: "Key-value stats (e.g. Friends: 42)",
        },
        profileUrl: { type: "string", description: "Link to full profile" },
      },
      required: ["name"],
    },
  },
  {
    name: "show_weather",
    description:
      "Display a weather card with current conditions and optional forecast. Gather weather data first, then call this to present it.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "City or location name" },
        temperature: { type: "number", description: "Current temperature" },
        unit: { type: "string", enum: ["C", "F"], description: "Temperature unit (default F)" },
        condition: {
          type: "string",
          description: "Weather condition (e.g. Sunny, Cloudy, Rain, Snow, Partly Cloudy)",
        },
        icon: { type: "string", description: "Optional emoji override for the condition" },
        humidity: { type: "number", description: "Humidity percentage" },
        wind: { type: "string", description: "Wind speed and direction (e.g. 12 mph W)" },
        forecast: {
          type: "array",
          items: {
            type: "object",
            properties: {
              day: { type: "string" },
              high: { type: "number" },
              low: { type: "number" },
              condition: { type: "string" },
            },
            required: ["day", "high", "low", "condition"],
          },
          description: "Up to 5 days of forecast",
        },
      },
      required: ["location", "temperature", "condition"],
    },
  },
  {
    name: "create_poll",
    description:
      "Display a poll card with a question and options. Use when the user wants to create a poll or vote.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The poll question" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              votes: { type: "number" },
            },
            required: ["id", "text"],
          },
          description: "Poll options (2-6 choices)",
        },
        totalVotes: { type: "number", description: "Total vote count" },
        isActive: { type: "boolean", description: "Whether voting is still open" },
      },
      required: ["question", "options"],
    },
  },
  {
    name: "preview_link",
    description:
      "Display a link preview card with title, description, and image. Use when sharing a URL that should be presented visually.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL being previewed" },
        title: { type: "string", description: "Page title" },
        description: { type: "string", description: "Page description or summary" },
        image: { type: "string", description: "Preview image URL (og:image)" },
        siteName: { type: "string", description: "Site name (e.g. GitHub, YouTube)" },
      },
      required: ["url"],
    },
  },
  {
    name: "show_table",
    description:
      "Display data in a compact table card. Use when presenting structured or tabular information.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Table heading" },
        columns: {
          type: "array",
          items: { type: "string" },
          description: "Column header names",
        },
        rows: {
          type: "array",
          items: { type: "object" },
          description: "Array of row objects keyed by column name",
        },
        caption: { type: "string", description: "Footer caption or source attribution" },
      },
      required: ["columns", "rows"],
    },
  },
];

function handle(msg) {
  const { method, params } = msg;

  if (method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "genui", version: "1.0.0" },
    };
  }

  if (method === "tools/list") {
    return { tools: TOOLS };
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments ?? {};
    const known = TOOLS.some((t) => t.name === name);
    if (!known) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(args) }],
    };
  }

  return null;
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    if (msg.id == null) return;
    const result = handle(msg);
    if (result) {
      const response = JSON.stringify({ jsonrpc: "2.0", id: msg.id, result });
      process.stdout.write(response + "\n");
    }
  } catch {
    // ignore malformed input
  }
});
