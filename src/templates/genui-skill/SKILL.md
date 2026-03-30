---
name: genui
description: Display rich cards in chat — profiles, weather, polls, link previews, and data tables
homepage: https://platform.heyamiko.com
metadata: {"openclaw":{"emoji":"🎴","requires":{"bins":["node"]}}}
---

# Generative UI Skill

Render rich, interactive cards in the chat interface instead of plain text. Each tool is a **display tool** — you provide the data, the frontend renders the card.

## When to use

- Presenting a user/twin/friend profile → `show_profile`
- Showing weather information → `show_weather`
- Creating or displaying a poll → `create_poll`
- Sharing a URL with a preview → `preview_link`
- Presenting tabular data → `show_table`

Always gather the data first (via other tools, web search, or your knowledge), then call the appropriate display tool to present it visually.

## Tools

### show_profile

Display a profile card with avatar, bio, tags, and stats.

**Required:** `name`
**Optional:** `username`, `avatar_url`, `bio`, `tags` (string[]), `stats` ({label, value}[]), `profileUrl`

```
mcporter call genui.show_profile name:"Alex Rivera" username:"alexr" bio:"Building the future of social AI" tags:'["AI","React","TypeScript"]' stats:'[{"label":"Friends","value":142},{"label":"Posts","value":38}]'
```

### show_weather

Display current weather with optional forecast.

**Required:** `location`, `temperature`, `condition`
**Optional:** `unit` (C/F, default F), `icon`, `humidity`, `wind`, `forecast` ({day, high, low, condition}[])

```
mcporter call genui.show_weather location:"San Francisco, CA" temperature:68 condition:"Partly Cloudy" humidity:72 wind:"12 mph W" forecast:'[{"day":"Mon","high":70,"low":58,"condition":"sunny"},{"day":"Tue","high":65,"low":55,"condition":"cloudy"}]'
```

### create_poll

Display a poll with question and options.

**Required:** `question`, `options` ({id, text, votes?}[])
**Optional:** `totalVotes`, `isActive`

```
mcporter call genui.create_poll question:"What framework do you prefer?" options:'[{"id":"1","text":"React","votes":42},{"id":"2","text":"Vue","votes":28},{"id":"3","text":"Svelte","votes":15}]' totalVotes:85 isActive:true
```

### preview_link

Display a link preview card with title, description, and image.

**Required:** `url`
**Optional:** `title`, `description`, `image`, `siteName`

```
mcporter call genui.preview_link url:"https://github.com" title:"GitHub" description:"Where over 100 million developers shape the future of software." siteName:"GitHub"
```

### show_table

Display data in a compact table.

**Required:** `columns` (string[]), `rows` (object[])
**Optional:** `title`, `caption`

```
mcporter call genui.show_table title:"Top Languages" columns:'["Language","Share","Trend"]' rows:'[{"Language":"TypeScript","Share":"28.3%","Trend":"Up"},{"Language":"Python","Share":"26.1%","Trend":"Up"}]'
```

## How it works

The skill runs a lightweight MCP server (`server.mjs`) over stdio. Each tool accepts structured data and returns it as JSON. The chat frontend intercepts tool results matching these names and renders the corresponding card component instead of raw text.

## Files

- `server.mjs` — MCP stdio server (Node.js, no dependencies)
- `SKILL.md` — This documentation
