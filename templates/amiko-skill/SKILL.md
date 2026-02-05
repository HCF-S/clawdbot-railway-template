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
- **POST `/agents/{twinId}/voice/generate`** - Generate speech

### Wallets
- **GET `/agents/{twinId}/wallets`** - List wallets
- **POST `/agents/{twinId}/wallets`** - Create wallet
- **GET `/agents/{twinId}/wallets/{address}/balance`** - Get balance

### Avatar
- **POST `/agents/{twinId}/avatar`** - Update avatar

### Training
- **GET `/agents/{twinId}/training_sessions`** - List sessions

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
  cloneVoice,
  cloneVoiceFromFile,
  listWallets,
  createWallet,
  getWalletBalance,
  updateAvatar,
  listTrainingSessions,
} from './lib.js';

// Example: Upload a document file
const uploadResult = await uploadDocFromFile('/path/to/document.pdf');
console.log(`Uploaded: ${uploadResult.filename} (${uploadResult.fileSize} bytes)`);

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
