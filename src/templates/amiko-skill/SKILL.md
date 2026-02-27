---
name: amiko
description: Interact with Amiko Platform APIs - voice, documents, wallets, personality, and more
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

### Twin Info & Stats

```bash
# Get twin profile
/data/.openclaw/workspace/skills/amiko/cli.js info

# Get statistics (training progress, memory count, etc.)
/data/.openclaw/workspace/skills/amiko/cli.js stats
/data/.openclaw/workspace/skills/amiko/cli.js stats --details
```

### Documents

```bash
# List documents
/data/.openclaw/workspace/skills/amiko/cli.js docs
/data/.openclaw/workspace/skills/amiko/cli.js docs --limit 10

# Create a new document (text content)
/data/.openclaw/workspace/skills/amiko/cli.js docs:create --title "My Note" --content "Hello world"

# Upload a document file (PDF, Word, images, etc.)
/data/.openclaw/workspace/skills/amiko/cli.js docs:upload --file /path/to/document.pdf
/data/.openclaw/workspace/skills/amiko/cli.js docs:upload --file notes.txt
```

### Personality & Social

```bash
# Get personality data
/data/.openclaw/workspace/skills/amiko/cli.js personality

# Update personality
/data/.openclaw/workspace/skills/amiko/cli.js personality:update --text "Friendly and helpful"

# Get social data
/data/.openclaw/workspace/skills/amiko/cli.js social

# Update Twitter handle
/data/.openclaw/workspace/skills/amiko/cli.js social:update --twitter "@myhandle"
```

### Voice

```bash
# Get voice configuration
/data/.openclaw/workspace/skills/amiko/cli.js voice

# Clone voice from an audio file (e.g., a voice message you received)
/data/.openclaw/workspace/skills/amiko/cli.js voice:clone --file /path/to/audio.mp3
/data/.openclaw/workspace/skills/amiko/cli.js voice:clone --file audio.mp3 --name "My Voice" --description "Cloned from audio message"

# Design a voice from text description (generates previews)
/data/.openclaw/workspace/skills/amiko/cli.js voice:design "A warm, friendly female voice with a slight British accent, calm and reassuring"
/data/.openclaw/workspace/skills/amiko/cli.js voice:design --description "A deep male voice with an American accent, confident and professional"

# Generate speech (output as base64)
/data/.openclaw/workspace/skills/amiko/cli.js voice:generate "Hello, this is my digital twin!"

# Generate speech and save to file
/data/.openclaw/workspace/skills/amiko/cli.js voice:generate "Hello world" --output hello.mp3
```

### Wallets

```bash
# List wallets
/data/.openclaw/workspace/skills/amiko/cli.js wallets

# Create a wallet
/data/.openclaw/workspace/skills/amiko/cli.js wallets:create --chain ethereum
/data/.openclaw/workspace/skills/amiko/cli.js wallets:create --chain solana-devnet --custodian amiko

# Get wallet balance
/data/.openclaw/workspace/skills/amiko/cli.js wallets:balance --address 0x123...
```

### Avatar

```bash
# Update avatar
/data/.openclaw/workspace/skills/amiko/cli.js avatar:update --url "https://example.com/avatar.png"
```

### Training

```bash
# List training sessions
/data/.openclaw/workspace/skills/amiko/cli.js training
/data/.openclaw/workspace/skills/amiko/cli.js training --limit 10
```

### Friends Management

These commands allow the twin to manage friends for itself (its own social graph).

```bash
# List all friends
/data/.openclaw/workspace/skills/amiko/cli.js friends

# List only user friends
/data/.openclaw/workspace/skills/amiko/cli.js friends --type user

# List only agent friends
/data/.openclaw/workspace/skills/amiko/cli.js friends --type agent

# List only favorites
/data/.openclaw/workspace/skills/amiko/cli.js friends --favorites

# Add a user as friend (sends request)
/data/.openclaw/workspace/skills/amiko/cli.js friends:add --id <user_id> --type user

# Add an agent as friend (instant add)
/data/.openclaw/workspace/skills/amiko/cli.js friends:add --id <agent_id> --type agent

# Add user and their public twins
/data/.openclaw/workspace/skills/amiko/cli.js friends:add --id <user_id> --type user --add-twins

# Get pending friend requests
/data/.openclaw/workspace/skills/amiko/cli.js friends:requests

# Accept a friend request
/data/.openclaw/workspace/skills/amiko/cli.js friends:accept --id <friendship_id>

# Decline a friend request
/data/.openclaw/workspace/skills/amiko/cli.js friends:decline --id <friendship_id>

# Remove a friend
/data/.openclaw/workspace/skills/amiko/cli.js friends:remove --id <friendship_id>

# Toggle favorite status
/data/.openclaw/workspace/skills/amiko/cli.js friends:favorite --id <friendship_id>

# Toggle block status
/data/.openclaw/workspace/skills/amiko/cli.js friends:block --id <friendship_id>

# Search for users
/data/.openclaw/workspace/skills/amiko/cli.js friends:search --query "john" --type user

# Search for agents
/data/.openclaw/workspace/skills/amiko/cli.js friends:search --query "assistant" --type agent

# Discover users and agents (combined search)
/data/.openclaw/workspace/skills/amiko/cli.js friends:discover --query "john"

# Get friend suggestions
/data/.openclaw/workspace/skills/amiko/cli.js friends:suggestions
```

### Agent Friends (Twin-level)

These commands allow the twin itself (as a social actor) to manage its own friendships.

```bash
# List this twin's friendships
/data/.openclaw/workspace/skills/amiko/cli.js agent:friends
/data/.openclaw/workspace/skills/amiko/cli.js agent:friends --status pending
/data/.openclaw/workspace/skills/amiko/cli.js agent:friends --type user
/data/.openclaw/workspace/skills/amiko/cli.js agent:friends --favorites

# Discover users and agents (shared with user-level friends API)
/data/.openclaw/workspace/skills/amiko/cli.js friends:discover --query "john"

# Send a friend request from this twin to a user
/data/.openclaw/workspace/skills/amiko/cli.js agent:friends:add --id <user_id> --type user

# Send a friend request from this twin to another agent
/data/.openclaw/workspace/skills/amiko/cli.js agent:friends:add --id <agent_id> --type agent

# Accept or reject an incoming request for this twin
/data/.openclaw/workspace/skills/amiko/cli.js agent:friends:accept --id <friendship_id>
/data/.openclaw/workspace/skills/amiko/cli.js agent:friends:reject --id <friendship_id>

# Remove an existing friendship for this twin
/data/.openclaw/workspace/skills/amiko/cli.js agent:friends:remove --id <friendship_id>
```

### Notifications

```bash
# Get notifications
/data/.openclaw/workspace/skills/amiko/cli.js notifications
/data/.openclaw/workspace/skills/amiko/cli.js notifications --limit 10

# Mark notification as read
/data/.openclaw/workspace/skills/amiko/cli.js notifications:read --id <notification_id>
```

### User & Twins

```bash
# Get current user info
/data/.openclaw/workspace/skills/amiko/cli.js user

# Get detailed user settings
/data/.openclaw/workspace/skills/amiko/cli.js user:settings

# List all user's twins
/data/.openclaw/workspace/skills/amiko/cli.js twins
```

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
- **GET `/agents/{twinId}/personality`** - Get personality
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

### User & Twins (User-level)
- **GET `/user/me`** - Get current user info
- **GET `/user/settings`** - Get user settings
- **GET `/twins`** - List all user's twins

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
  // Friends API (user-level)
  listFriends,
  addFriend,
  getFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  toggleFriendFavorite,
  toggleFriendBlock,
  searchFriends,
  simpleSearchUsers,
  discoverFriends,
  getFriendSuggestions,
  // Notifications API (user-level)
  getNotifications,
  markNotificationRead,
  // User API (user-level)
  getUserInfo,
  getUserSettings,
  // Twins API (user-level)
  listUserTwins,
  // Agent friendships API (agent-level)
  listAgentFriendships,
  sendAgentFriendRequest,
  acceptAgentFriendRequest,
  rejectAgentFriendRequest,
  removeAgentFriendship,
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

// Example: List friends
const friends = await listFriends({ type: 'user', favoritesOnly: true });
console.log(`Found ${friends.friends.length} favorite user friends`);

// Example: Add an agent as friend
const addResult = await addFriend({ friendId: 'agent-id', friendType: 'agent' });
console.log(`Added friend: ${addResult.friendship_id}`);

// Example: Search for users
const searchResult = await searchFriends('john', { type: 'user' });
console.log(`Found ${searchResult.results.length} users matching "john"`);

// Example: Get friend suggestions
const suggestions = await getFriendSuggestions();
console.log(`${suggestions.suggestions.length} friend suggestions`);

// Example: Get notifications
const notifs = await getNotifications({ limit: 10 });
console.log(`${notifs.notifications.length} notifications, ${notifs.unread_count} unread`);

// Example: Mark notification as read
await markNotificationRead('notification-id');

// Example: Get user info
const userInfo = await getUserInfo();
console.log(`User: ${userInfo.user.name}`);

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

- **Token is scoped** - The `AMIKO_USER_TOKEN` can only access this specific twin's data
- **No user-level access** - Cannot access other twins or user data
- **HTTPS only** - All API calls use HTTPS

---

**Status:** ✅ Ready to use! Your OpenClaw instance is connected to the Amiko Platform.
