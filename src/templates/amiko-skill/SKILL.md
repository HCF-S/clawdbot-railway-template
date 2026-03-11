---
name: amiko
description: Interact with Amiko Platform APIs - voice, documents, wallets, personality, and more
homepage: https://platform.heyamiko.com
metadata: {"openclaw":{"emoji":"🤖","requires":{"bins":["node"]}}}
---

# Amiko Skill

Connect your OpenClaw instance to the Amiko Platform as your digital twin.

## Configuration

Config is read from `workspace/.amiko.json` (per-agent). The platform writes this when the instance is assigned via `POST /setup/api/init` or `POST /setup/api/amiko/write`. Standard fields are `AMIKO_USER_ID`, `AMIKO_TWIN_ID`, `AMIKO_TWIN_TOKEN`, `AMIKO_PLATFORM_URL`. `AMIKO_USER_TOKEN` can also be present when you want direct user-level API access.

`AMIKO_TWIN_TOKEN` is used for twin-scoped APIs. `AMIKO_USER_TOKEN` is optional. The local `amiko-web` matching endpoints should accept twin tokens so the agent does not need user-level personality write access.

The skill lives in the shared folder `/data/.openclaw/skills/amiko/`, not in the workspace. When multiple agents exist, specify which workspace to use:

- `--agent <id>` — Agent ID (default: `main`). Loads `workspace/.amiko.json` for main, or `workspace-<id>/.amiko.json` for others.
- `--workspace <path>` — Explicit path (e.g. `/data/.openclaw/workspace`).

## Quick Commands

### Twin Info & Stats

```bash
# Get twin profile (uses main workspace by default)
/data/.openclaw/skills/amiko/cli.js info

# Specify agent when multiple exist
/data/.openclaw/skills/amiko/cli.js --agent main info
/data/.openclaw/skills/amiko/cli.js --workspace /data/.openclaw/workspace stats --details
```

### Documents

```bash
# List documents
/data/.openclaw/skills/amiko/cli.js docs
/data/.openclaw/skills/amiko/cli.js docs --limit 10

# Create a new document (text content)
/data/.openclaw/skills/amiko/cli.js docs:create --title "My Note" --content "Hello world"

# Upload a document file (PDF, Word, images, etc.)
/data/.openclaw/skills/amiko/cli.js docs:upload --file /path/to/document.pdf
/data/.openclaw/skills/amiko/cli.js docs:upload --file notes.txt
```

### Personality & Social

```bash
# Get twin personality data
# In current amiko-web, this may include shared_personality mirrored from the user profile
/data/.openclaw/skills/amiko/cli.js personality

# Update twin-local personality text
/data/.openclaw/skills/amiko/cli.js personality:update --text "Friendly and helpful"

# Get social data
/data/.openclaw/skills/amiko/cli.js social

# Update Twitter handle
/data/.openclaw/skills/amiko/cli.js social:update --twitter "@myhandle"
```

### Matching

```bash
# Suggest relationship types for matching
/data/.openclaw/skills/amiko/cli.js user:match:suggest
/data/.openclaw/skills/amiko/cli.js user:match:suggest --context "I'm looking for a creative collaborator"

# Generate or fetch a cached matching spec
/data/.openclaw/skills/amiko/cli.js user:match:spec --relationship creative_sparring_partner

# Find matches using a relationship type or cached spec id
/data/.openclaw/skills/amiko/cli.js user:match:find --relationship creative_sparring_partner --limit 5
/data/.openclaw/skills/amiko/cli.js user:match:find --spec-id <spec_id> --limit 5

```

### Voice

```bash
# Get voice configuration
/data/.openclaw/skills/amiko/cli.js voice

# Clone voice from an audio file (e.g., a voice message you received)
/data/.openclaw/skills/amiko/cli.js voice:clone --file /path/to/audio.mp3
/data/.openclaw/skills/amiko/cli.js voice:clone --file audio.mp3 --name "My Voice" --description "Cloned from audio message"

# Design a voice from text description (generates previews)
/data/.openclaw/skills/amiko/cli.js voice:design "A warm, friendly female voice with a slight British accent, calm and reassuring"
/data/.openclaw/skills/amiko/cli.js voice:design --description "A deep male voice with an American accent, confident and professional"

# Generate speech (output as base64)
/data/.openclaw/skills/amiko/cli.js voice:generate "Hello, this is my digital twin!"

# Generate speech and save to file
/data/.openclaw/skills/amiko/cli.js voice:generate "Hello world" --output hello.mp3
```

### Wallets

```bash
# List wallets
/data/.openclaw/skills/amiko/cli.js wallets

# Create a wallet
/data/.openclaw/skills/amiko/cli.js wallets:create --chain ethereum
/data/.openclaw/skills/amiko/cli.js wallets:create --chain solana-devnet --custodian amiko

# Get wallet balance
/data/.openclaw/skills/amiko/cli.js wallets:balance --address 0x123...
```

### Avatar

```bash
# Update avatar
/data/.openclaw/skills/amiko/cli.js avatar:update --url "https://example.com/avatar.png"
```

### Training

```bash
# List training sessions
/data/.openclaw/skills/amiko/cli.js training
/data/.openclaw/skills/amiko/cli.js training --limit 10
```

### Agent Friends (Twin-level)

These commands allow the twin itself (as a social actor) to manage its own friendships.

```bash
# List this twin's friendships
/data/.openclaw/skills/amiko/cli.js agent:friends
/data/.openclaw/skills/amiko/cli.js agent:friends --status pending
/data/.openclaw/skills/amiko/cli.js agent:friends --type user
/data/.openclaw/skills/amiko/cli.js agent:friends --favorites

# Discover users and agents (shared with user-level friends API)
/data/.openclaw/skills/amiko/cli.js friends:discover --query "john"

# Send a friend request from this twin to a user
/data/.openclaw/skills/amiko/cli.js agent:friends:add --id <user_id> --type user

# Send a friend request from this twin to another agent
/data/.openclaw/skills/amiko/cli.js agent:friends:add --id <agent_id> --type agent

# Accept or reject an incoming request for this twin
/data/.openclaw/skills/amiko/cli.js agent:friends:accept --id <friendship_id>
/data/.openclaw/skills/amiko/cli.js agent:friends:reject --id <friendship_id>

# Remove an existing friendship for this twin
/data/.openclaw/skills/amiko/cli.js agent:friends:remove --id <friendship_id>
```

### Notifications

```bash
# Get notifications
/data/.openclaw/skills/amiko/cli.js notifications
/data/.openclaw/skills/amiko/cli.js notifications --limit 10

# Mark notification as read
/data/.openclaw/skills/amiko/cli.js notifications:read --id <notification_id>
```

### User & Twins

```bash
# Get current user info
/data/.openclaw/skills/amiko/cli.js user

# Get detailed user settings
/data/.openclaw/skills/amiko/cli.js user:settings

# List all user's twins
/data/.openclaw/skills/amiko/cli.js twins
```

### Composio Connections

```bash
# List all connected Composio services (Gmail, Slack, GitHub, Spotify, etc.)
/data/.openclaw/skills/amiko/cli.js composio:connections
```

Use this to check which external services are connected for this twin. The response includes connection status, app names, and IDs. This is the authoritative source for what services are available — use it when asked about connected tools/services.

## API Endpoints

Base URL: `https://platform.heyamiko.com/api`

### Twin Data
- **GET `/agents/{twinId}`** - Get twin profile
- **GET `/agents/{twinId}/stat`** - Get twin statistics

### Documents
- **GET `/agents/{twinId}/docs`** - List documents
- **POST `/agents/{twinId}/docs`** - Create document (text content)
- **POST `/agents/{twinId}/docs/upload`** - Upload document file

### Personality & Social
- **GET `/agents/{twinId}/personality`** - Get twin personality; current local `amiko-web` may also return `shared_personality`
- **POST `/agents/{twinId}/personality`** - Update personality
- **GET `/agents/{twinId}/social`** - Get social data
- **POST `/agents/{twinId}/social`** - Update social data

### Voice
- **GET `/agents/{twinId}/voice`** - Get voice config
- **POST `/agents/{twinId}/voice/clone`** - Clone voice from audio file
- **POST `/agents/{twinId}/voice/design`** - Design voice from text description
- **POST `/agents/{twinId}/voice/generate`** - Generate speech

### Wallets
- **GET `/agents/{twinId}/wallets`** - List wallets
- **POST `/agents/{twinId}/wallets`** - Create wallet
- **GET `/agents/{twinId}/wallets/{address}/balance`** - Get balance

### Avatar
- **POST `/agents/{twinId}/avatar`** - Update avatar

### Training
- **GET `/agents/{twinId}/training_sessions`** - List sessions

### Friends (Agent-level, twin as actor)
- **GET `/agents/{twinId}/friendships`** - List friendships and requests for this twin
- **POST `/agents/{twinId}/friendships`** - Send a friend request from this twin to a user or agent
- **PATCH `/agents/{twinId}/friendships/{friendshipId}`** - Update friendship status from the twin's perspective (accept/reject/block/favorite)
- **DELETE `/agents/{twinId}/friendships/{friendshipId}`** - Remove a friendship from the twin's perspective

### Notifications (User-level)
- **GET `/notifications`** - Get notifications (supports cursor, limit)
- **PATCH `/notifications`** - Mark notification as read (notificationId)

### Matching (User-level endpoints, callable by twin token once backend auth is updated)
- **POST `/user/personality-profile/suggest-relationship`** - Suggest relationship types for matching
- **POST `/user/personality-profile/generate-matching-spec`** - Generate or fetch cached matching spec
- **GET `/user/personality-profile/matches`** - Find matches using `spec_id` or `relationship_type`

### User & Twins (User-level)
- **GET `/user/me`** - Get current user info
- **GET `/user/settings`** - Get user settings
- **GET `/twins`** - List all user's twins

### Composio Connections (Twin-level)
- **GET `/agents/{twinId}/composio/connections`** - List all connected Composio services with status

## Library Functions (lib.js)

```javascript
import { 
  getTwinInfo,
  getTwinStats,
  listDocs,
  createDoc,
  uploadDoc,
  uploadDocFromFile,
  getPersonality,
  updatePersonality,
  getSocial,
  updateSocial,
  getVoice,
  generateVoice,
  generateVoiceToFile,
  designVoice,
  cloneVoice,
  cloneVoiceFromFile,
  listWallets,
  createWallet,
  getWalletBalance,
  updateAvatar,
  listTrainingSessions,
  // Friends discovery (read-only)
  discoverFriends,
  // Notifications API (user-level)
  getNotifications,
  markNotificationRead,
  // User API (user-level)
  getUserInfo,
  getUserSettings,
  suggestRelationshipTypes,
  generateMatchingSpec,
  findPersonalityMatches,
  // Twins API (user-level)
  listUserTwins,
  // Agent friendships API (agent-level)
  listAgentFriendships,
  sendAgentFriendRequest,
  acceptAgentFriendRequest,
  rejectAgentFriendRequest,
  removeAgentFriendship,
  // Composio connections
  listComposioConnections,
} from './lib.js';

// Example: Upload a document file
const uploadResult = await uploadDocFromFile('/path/to/document.pdf');
console.log(`Uploaded: ${uploadResult.filename} (${uploadResult.fileSize} bytes)`);

// Example: Design a voice from description
const designResult = await designVoice("A warm, friendly female voice with a slight British accent");
console.log(`Generated ${designResult.previews.length} voice preview(s)`);
// Each preview has: audio_base_64, generated_voice_id, duration_secs

// Example: Clone voice from an audio file
const cloneResult = await cloneVoiceFromFile('/path/to/audio.mp3', {
  voiceName: 'My Cloned Voice',
  description: 'Voice cloned from audio message'
});
console.log(`Voice cloned: ${cloneResult.elevenlabs_voice_id}`);

// Example: Generate voice and save to file
const voiceResult = await generateVoiceToFile("Hello!", "output.mp3");
console.log(`Saved ${voiceResult.size} bytes to ${voiceResult.path}`);

// Example: Get twin stats
const stats = await getTwinStats({ details: true });
console.log(`Training progress: ${stats.trainingProgress}%`);

// Example: Get notifications
const notifs = await getNotifications({ limit: 10 });
console.log(`${notifs.notifications.length} notifications, ${notifs.unread_count} unread`);

// Example: Mark notification as read
await markNotificationRead('notification-id');

// Example: Get user info
const userInfo = await getUserInfo();
console.log(`User: ${userInfo.user.name}`);

// Example: Generate a matching spec and fetch matches
const spec = await generateMatchingSpec('creative_sparring_partner');
const matches = await findPersonalityMatches({ specId: spec.spec_id, limit: 3 });
console.log(`Found ${matches.matches.length} match(es)`);

// Example: List all twins
const twins = await listUserTwins();
console.log(`User has ${twins.length} twin(s)`);

// Example: List pending friendships for this twin (agent-level)
const agentFriendships = await listAgentFriendships({ status: 'pending' });
console.log(`This twin has ${agentFriendships.friendships.length} pending friendship(s)`);

// Example: Send a friend request from this twin to a user
const agentRequest = await sendAgentFriendRequest({ targetId: 'user-id', targetType: 'user' });
console.log(`Agent friend request ID: ${agentRequest.friendship_id}`);

// Example: Accept an incoming friendship for this twin
await acceptAgentFriendRequest('friendship-id');
```

## Files

- `cli.js` - Command-line tool
- `lib.js` - Shared library functions
- `SKILL.md` - This documentation

## Security

- **Twin token is scoped** - `AMIKO_TWIN_TOKEN` is limited to the configured twin's APIs
- **User token is broader** - `AMIKO_USER_TOKEN` can still be stored, but the intended path is to let matching endpoints accept the twin token
- **Use the smallest token possible** - Prefer twin token for agent-facing matching calls
- **HTTPS only** - All API calls use HTTPS

---

**Status:** ✅ Ready to use! Your OpenClaw instance is connected to the Amiko Platform.
