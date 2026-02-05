---
name: amiko
description: Interact with Amiko Platform APIs - voice generation, twin data, and more
homepage: https://platform.heyamiko.com
metadata: {"openclaw":{"emoji":"🤖","requires":{"bins":["node"]}}}
---

# Amiko Skill

Connect your OpenClaw instance to the Amiko Platform as your digital twin.

## Environment Variables

These are automatically set when the OpenClaw instance is created:

- `AMIKO_USER_ID` - Your user's unique ID on the Amiko platform
- `AMIKO_TWIN_ID` - Your twin's unique ID
- `AMIKO_USER_TOKEN` - Authentication token (scoped to your twin)
- `AMIKO_PLATFORM_URL` - Platform API URL (default: https://platform.heyamiko.com)

## Quick Commands

### Generate Voice Audio

Generate speech using your twin's cloned voice:

```bash
~/.openclaw/skills/amiko/cli.js voice "Hello, this is my digital twin speaking!"
```

Options:
- `--output <file>` - Save to file (default: outputs to stdout as base64)
- `--model <id>` - ElevenLabs model ID (default: eleven_multilingual_v2)

Example with file output:
```bash
~/.openclaw/skills/amiko/cli.js voice "Hello world" --output hello.mp3
```

### Get Twin Info

Get your twin's profile information:

```bash
~/.openclaw/skills/amiko/cli.js info
```

### List Documents

List documents associated with your twin:

```bash
~/.openclaw/skills/amiko/cli.js docs
```

Options:
- `--limit <n>` - Number of docs to fetch (default: 50)
- `--offset <n>` - Pagination offset (default: 0)

## API Endpoints

Base URL: `https://platform.heyamiko.com/api`

### Voice Generation

- **POST `/agents/{twinId}/voice/generate`** - Generate speech with cloned voice
  - Body (FormData): `text_to_generate`, `model_id` (optional)
  - Returns: Audio stream (audio/mpeg)

### Twin Data

- **GET `/agents/{twinId}`** - Get twin profile
- **GET `/agents/{twinId}/docs`** - List twin documents

## Example Usage in Chat

**"Say hello using my voice"**
```bash
~/.openclaw/skills/amiko/cli.js voice "Hello! I'm your digital twin."
```

**"Generate a voice message and save it"**
```bash
~/.openclaw/skills/amiko/cli.js voice "This is a test message" --output message.mp3
```

**"What's my twin info?"**
```bash
~/.openclaw/skills/amiko/cli.js info
```

**"Show my training documents"**
```bash
~/.openclaw/skills/amiko/cli.js docs --limit 10
```

## Files

- `cli.js` - Command-line tool
- `lib.js` - Shared library functions
- `SKILL.md` - This documentation

## Security

- **Token is scoped** - The `AMIKO_USER_TOKEN` can only access this specific twin's data
- **No user-level access** - Cannot access other twins or user data
- **HTTPS only** - All API calls use HTTPS

---

**Status:** ✅ Ready to use! Your OpenClaw instance is connected to the Amiko Platform.
