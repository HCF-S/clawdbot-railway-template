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
~/.openclaw/skills/amiko/cli.js info

# Get statistics (training progress, memory count, etc.)
~/.openclaw/skills/amiko/cli.js stats
~/.openclaw/skills/amiko/cli.js stats --details
```

### Documents

```bash
# List documents
~/.openclaw/skills/amiko/cli.js docs
~/.openclaw/skills/amiko/cli.js docs --limit 10

# Create a new document (text content)
~/.openclaw/skills/amiko/cli.js docs:create --title "My Note" --content "Hello world"

# Upload a document file (PDF, Word, images, etc.)
~/.openclaw/skills/amiko/cli.js docs:upload --file /path/to/document.pdf
~/.openclaw/skills/amiko/cli.js docs:upload --file notes.txt
```

### Personality & Social

```bash
# Get personality data
~/.openclaw/skills/amiko/cli.js personality

# Update personality
~/.openclaw/skills/amiko/cli.js personality:update --text "Friendly and helpful"

# Get social data
~/.openclaw/skills/amiko/cli.js social

# Update Twitter handle
~/.openclaw/skills/amiko/cli.js social:update --twitter "@myhandle"
```

### Voice

```bash
# Get voice configuration
~/.openclaw/skills/amiko/cli.js voice

# Clone voice from an audio file (e.g., a voice message you received)
~/.openclaw/skills/amiko/cli.js voice:clone --file /path/to/audio.mp3
~/.openclaw/skills/amiko/cli.js voice:clone --file audio.mp3 --name "My Voice" --description "Cloned from audio message"

# Design a voice from text description (generates previews)
~/.openclaw/skills/amiko/cli.js voice:design "A warm, friendly female voice with a slight British accent, calm and reassuring"
~/.openclaw/skills/amiko/cli.js voice:design --description "A deep male voice with an American accent, confident and professional"

# Generate speech (output as base64)
~/.openclaw/skills/amiko/cli.js voice:generate "Hello, this is my digital twin!"

# Generate speech and save to file
~/.openclaw/skills/amiko/cli.js voice:generate "Hello world" --output hello.mp3
```

### Wallets

```bash
# List wallets
~/.openclaw/skills/amiko/cli.js wallets

# Create a wallet
~/.openclaw/skills/amiko/cli.js wallets:create --chain ethereum
~/.openclaw/skills/amiko/cli.js wallets:create --chain solana-devnet --custodian amiko

# Get wallet balance
~/.openclaw/skills/amiko/cli.js wallets:balance --address 0x123...
```

### Avatar

```bash
# Update avatar
~/.openclaw/skills/amiko/cli.js avatar:update --url "https://example.com/avatar.png"
```

### Training

```bash
# List training sessions
~/.openclaw/skills/amiko/cli.js training
~/.openclaw/skills/amiko/cli.js training --limit 10
```

### Friends Management

These commands allow the twin to manage friends on behalf of the user.

```bash
# List all friends
~/.openclaw/skills/amiko/cli.js friends

# List only user friends
~/.openclaw/skills/amiko/cli.js friends --type user

# List only agent friends
~/.openclaw/skills/amiko/cli.js friends --type agent

# List only favorites
~/.openclaw/skills/amiko/cli.js friends --favorites

# Add a user as friend (sends request)
~/.openclaw/skills/amiko/cli.js friends:add --id <user_id> --type user

# Add an agent as friend (instant add)
~/.openclaw/skills/amiko/cli.js friends:add --id <agent_id> --type agent

# Add user and their public twins
~/.openclaw/skills/amiko/cli.js friends:add --id <user_id> --type user --add-twins

# Get pending friend requests
~/.openclaw/skills/amiko/cli.js friends:requests

# Accept a friend request
~/.openclaw/skills/amiko/cli.js friends:accept --id <friendship_id>

# Decline a friend request
~/.openclaw/skills/amiko/cli.js friends:decline --id <friendship_id>

# Remove a friend
~/.openclaw/skills/amiko/cli.js friends:remove --id <friendship_id>

# Toggle favorite status
~/.openclaw/skills/amiko/cli.js friends:favorite --id <friendship_id>

# Toggle block status
~/.openclaw/skills/amiko/cli.js friends:block --id <friendship_id>

# Search for users
~/.openclaw/skills/amiko/cli.js friends:search --query "john" --type user

# Search for agents
~/.openclaw/skills/amiko/cli.js friends:search --query "assistant" --type agent

# Discover users and agents (combined search)
~/.openclaw/skills/amiko/cli.js friends:discover --query "john"

# Get friend suggestions
~/.openclaw/skills/amiko/cli.js friends:suggestions
```

### Notifications

```bash
# Get notifications
~/.openclaw/skills/amiko/cli.js notifications
~/.openclaw/skills/amiko/cli.js notifications --limit 10

# Mark notification as read
~/.openclaw/skills/amiko/cli.js notifications:read --id <notification_id>
```

### User & Twins

```bash
# Get current user info
~/.openclaw/skills/amiko/cli.js user

# Get detailed user settings
~/.openclaw/skills/amiko/cli.js user:settings

# List all user's twins
~/.openclaw/skills/amiko/cli.js twins
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

### Friends (User-level)
- **GET `/friends`** - List friends (supports type, sub_type, favorites_only filters)
- **POST `/friends`** - Add friend (friend_id, friend_type, also_add_twins)
- **GET `/friends/requests`** - Get pending requests
- **PATCH `/friends/{id}/accept`** - Accept request
- **PATCH `/friends/{id}/decline`** - Decline request
- **DELETE `/friends/{id}`** - Remove friend
- **POST `/friends/{id}/favorite`** - Toggle favorite
- **POST `/friends/{id}/block`** - Toggle block
- **GET `/friends/search`** - Search users/agents (q, type)
- **GET `/friends/discover`** - Combined search (q)
- **GET `/friends/suggestions`** - Get suggestions

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
