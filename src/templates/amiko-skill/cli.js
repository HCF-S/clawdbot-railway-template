#!/usr/bin/env node

/**
 * Amiko Skill CLI
 * Command-line interface for interacting with Amiko Platform APIs
 */

import {
  getConfig,
  setAgentId,
  setWorkspacePath,
  getTwinInfo,
  getTwinStats,
  listDocs,
  createDoc,
  uploadDocFromFile,
  getPersonality,
  updatePersonality,
  getSocial,
  updateSocial,
  getVoice,
  generateVoice,
  generateVoiceToFile,
  designVoice,
  cloneVoiceFromFile,
  listWallets,
  createWallet,
  getWalletBalance,
  updateAvatar,
  listTrainingSessions,
  // Friends discovery (read-only)
  discoverFriends,
  // Notifications API
  getNotifications,
  markNotificationRead,
  // User API
  getUserInfo,
  getUserSettings,
  suggestRelationshipTypes,
  generateMatchingSpec,
  findPersonalityMatches,
  // Twins API
  listUserTwins,
  // Agent friendships API (agent-level)
  listAgentFriendships,
  sendAgentFriendRequest,
  acceptAgentFriendRequest,
  rejectAgentFriendRequest,
  removeAgentFriendship,
  // Composio connections API
  listComposioConnections,
  getFriendSuggestions,
} from './lib.js';

const args = process.argv.slice(2);

function printUsage() {
  console.log(`
Amiko Skill CLI - Interact with Amiko Platform

The skill is installed in the shared folder at /data/.openclaw/skills/amiko/.
Config is read from workspace/.amiko.json. Use --agent or --workspace to specify
which workspace to use when multiple agents exist.

Usage:
  /data/.openclaw/skills/amiko/cli.js [--agent <id>] [--workspace <path>] <command> [options]

Global options (apply to all commands):
  --agent <id>       Agent ID (default: main). Loads workspace/.amiko.json for main,
                     or workspace-<id>/.amiko.json for other agents.
  --workspace <path> Explicit workspace path (overrides --agent). E.g. /data/.openclaw/workspace

Commands:
  info               Get your twin's profile information
  
  stats              Get twin statistics (training progress, memories, etc.)
                     Options:
                       --details        Include detailed category progress
  
  docs               List documents associated with your twin
                     Options:
                       --limit <n>      Number of docs (default: 50)
                       --offset <n>     Pagination offset (default: 0)
  
  docs:create        Create a new document (text content)
                     Options:
                       --title <title>  Document title (required)
                       --content <text> Document content (required)
                       --type <type>    Document type (default: text)
  
  docs:upload        Upload a document file
                     Options:
                       --file <path>    Path to file (required)
  
  personality        Get twin personality data
                     Notes:
                       Returns shared_personality when Amiko Web mirrors user personality to twins
  
  personality:update Update twin personality
                     Options:
                       --text <text>    Personality description (required)

  user:match:suggest Suggest relationship types for personality matching
                     Options:
                       --context <text> Optional context hint

  user:match:spec    Generate or fetch a cached matching spec
                     Options:
                       --relationship <type> Relationship type (required)
                       --rationale <text>   Optional rationale

  user:match:find    Find personality matches for the user
                     Options:
                       --spec-id <id>       Cached spec ID
                       --relationship <type> Relationship type
                       --limit <n>          Number of matches (default: 10)
  
  social             Get twin social data
  
  social:update      Update twin social data
                     Options:
                       --twitter <handle>  Twitter handle
  
  voice              Get voice configuration
  
  voice:generate     Generate speech using your twin's cloned voice
                     Options:
                       <text>           Text to speak (required)
                       --output <file>  Save to file (default: base64 to stdout)
                       --model <id>     ElevenLabs model ID
  
  voice:clone        Clone a voice from an audio file
                     Options:
                       --file <path>        Path to audio file (required)
                       --name <name>        Name for the cloned voice
                       --description <desc> Description for the voice
  
  voice:design       Design a voice from a text description
                     Options:
                       --description <text> Voice description (min 20 chars, required)
                     Example:
                       "A warm, friendly female voice with a slight British accent"
  
  wallets            List wallets
  
  wallets:create     Create a new wallet
                     Options:
                       --chain <chain>      Blockchain (ethereum, polygon, solana-devnet)
                       --custodian <name>   Custodian (crossmint, amiko)
  
  wallets:balance    Get wallet balance
                     Options:
                       --address <addr>     Wallet address (required)
  
  avatar:update      Update twin avatar
                     Options:
                       --url <url>          Avatar URL
                       --original <url>     Original photo URL
  
  training           List training sessions
                     Options:
                       --limit <n>      Number of sessions (default: 50)
                       --offset <n>     Pagination offset (default: 0)
  
  --- Agent Friends Management (Agent-level, twin as actor) ---
  
  agent:friends      List friendships for this twin (agent)
                     Options:
                       --status <s>     Filter: 'accepted', 'pending', or 'blocked'
                       --type <type>    Filter: 'user' or 'agent'
                       --favorites      Only show favorites
  
  agent:friends:add  Send a friend request from this twin
                     Options:
                       --id <id>        Target user or agent ID (required)
                       --type <type>    'user' or 'agent' (default: user)
  
  agent:friends:accept  Accept an incoming request for this twin
                     Options:
                       --id <id>        Friendship ID (required)
  
  agent:friends:reject  Reject an incoming request for this twin
                     Options:
                       --id <id>        Friendship ID (required)
  
  agent:friends:remove  Remove an existing friendship for this twin
                     Options:
                       --id <id>        Friendship ID (required)
  
  friends:discover   Discover users and agents (combined search, read-only)
                     Options:
                       --query <q>      Search query (required)

  --- Notifications ---
  
  notifications      Get notifications
                     Options:
                       --limit <n>      Number to fetch (default: 20)
                       --cursor <date>  Pagination cursor (ISO date)
  
  notifications:read Mark a notification as read
                     Options:
                       --id <id>        Notification ID (required)
  
  --- User & Twins ---
  
  user               Get current user info
  
  user:settings      Get detailed user settings
  
  twins              List all user's twins

  --- Composio Connections ---

  composio:connections  List all Composio-connected services for this twin
                       (Gmail, Slack, GitHub, Spotify, etc.)

  help               Show this help message

Configuration:
  Config is read from workspace/.amiko.json (amikoUserId, amikoTwinId, amikoTwinToken,
  amikoUserToken, amikoPlatformUrl). Env vars AMIKO_* are used as fallback.
  Matching commands use the configured token. In local amiko-web they should accept twin tokens.

Examples:
  /data/.openclaw/skills/amiko/cli.js info
  /data/.openclaw/skills/amiko/cli.js --agent main info
  /data/.openclaw/skills/amiko/cli.js --workspace /data/.openclaw/workspace stats --details
  /data/.openclaw/skills/amiko/cli.js docs --limit 10
  /data/.openclaw/skills/amiko/cli.js docs:create --title "My Note" --content "Hello world"
  /data/.openclaw/skills/amiko/cli.js user:match:spec --relationship creative_sparring_partner
  /data/.openclaw/skills/amiko/cli.js user:match:find --relationship creative_sparring_partner --limit 5
  /data/.openclaw/skills/amiko/cli.js voice:generate "Hello, this is my digital twin!"
  /data/.openclaw/skills/amiko/cli.js voice:generate "Hello world" --output hello.mp3
`);
}

function parseArgs(args) {
  const result = { _: [] };
  let i = 0;
  while (i < args.length) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      result[key] = value;
      i += value === true ? 1 : 2;
    } else {
      result._.push(args[i]);
      i++;
    }
  }
  return result;
}

async function main() {
  const parsed = parseArgs(args);
  const command = parsed._[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  // Apply workspace/agent selection (skill runs from shared folder, not workspace)
  if (parsed.workspace) setWorkspacePath(parsed.workspace);
  else if (parsed.agent) setAgentId(parsed.agent);

  const config = getConfig();
  if (!config.twinId && !config.twinToken && !config.userToken) {
    console.error('Error: Amiko config is missing');
    console.error('Ensure workspace/.amiko.json exists with AMIKO_TWIN_ID / AMIKO_TWIN_TOKEN. Add AMIKO_USER_TOKEN only if you need direct user-level commands that are not twin-token compatible.');
    process.exit(1);
  }

  try {
    switch (command) {
      case 'info': {
        const twin = await getTwinInfo();
        console.log(JSON.stringify(twin, null, 2));
        break;
      }
      
      case 'stats': {
        const options = { details: !!parsed.details };
        const stats = await getTwinStats(options);
        console.log(JSON.stringify(stats, null, 2));
        break;
      }
      
      case 'docs': {
        const options = {
          limit: parsed.limit ? parseInt(parsed.limit, 10) : 50,
          offset: parsed.offset ? parseInt(parsed.offset, 10) : 0,
        };
        const result = await listDocs(options);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'docs:create': {
        if (!parsed.title || !parsed.content) {
          console.error('Error: --title and --content are required');
          process.exit(1);
        }
        const result = await createDoc({
          title: parsed.title,
          content: parsed.content,
          type: parsed.type || 'text',
        });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'docs:upload': {
        if (!parsed.file) {
          console.error('Error: --file is required');
          console.error('Usage: cli.js docs:upload --file /path/to/document.pdf');
          process.exit(1);
        }
        
        console.error(`Uploading file: ${parsed.file}`);
        const result = await uploadDocFromFile(parsed.file);
        console.error(`File uploaded successfully!`);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'personality': {
        const result = await getPersonality();
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'personality:update': {
        if (!parsed.text) {
          console.error('Error: --text is required');
          process.exit(1);
        }
        const result = await updatePersonality(parsed.text);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'user:match:suggest': {
        const result = await suggestRelationshipTypes(parsed.context ? String(parsed.context) : '');
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'user:match:spec': {
        if (!parsed.relationship) {
          console.error('Error: --relationship is required');
          process.exit(1);
        }
        const result = await generateMatchingSpec(String(parsed.relationship), parsed.rationale ? String(parsed.rationale) : '');
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'user:match:find': {
        if (!parsed['spec-id'] && !parsed.relationship) {
          console.error('Error: either --spec-id or --relationship is required');
          process.exit(1);
        }
        const result = await findPersonalityMatches({
          specId: parsed['spec-id'] ? String(parsed['spec-id']) : undefined,
          relationshipType: parsed.relationship ? String(parsed.relationship) : undefined,
          limit: parsed.limit ? parseInt(parsed.limit, 10) : 10,
        });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'social': {
        const result = await getSocial();
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'social:update': {
        const data = {};
        if (parsed.twitter) data.twitter_handle = parsed.twitter;
        if (Object.keys(data).length === 0) {
          console.error('Error: At least one option is required (--twitter)');
          process.exit(1);
        }
        const result = await updateSocial(data);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'voice': {
        const result = await getVoice();
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'voice:generate': {
        const text = parsed._.slice(1).join(' ');
        
        if (!text) {
          console.error('Error: Text is required for voice generation');
          console.error('Usage: cli.js voice:generate "Your text here"');
          process.exit(1);
        }
        
        const options = {};
        if (parsed.model) {
          options.modelId = parsed.model;
        }
        
        if (parsed.output) {
          // Save to file
          console.error(`Generating voice for: "${text}"`);
          const result = await generateVoiceToFile(text, parsed.output, options);
          console.error(`Saved to: ${result.path} (${result.size} bytes)`);
          console.log(JSON.stringify({ ok: true, path: result.path, size: result.size }));
        } else {
          // Output as base64
          console.error(`Generating voice for: "${text}"`);
          const audioBuffer = await generateVoice(text, options);
          const base64 = Buffer.from(audioBuffer).toString('base64');
          console.log(JSON.stringify({ 
            ok: true, 
            audio: base64, 
            contentType: 'audio/mpeg',
            size: audioBuffer.byteLength 
          }));
        }
        break;
      }
      
      case 'voice:clone': {
        if (!parsed.file) {
          console.error('Error: --file is required');
          console.error('Usage: cli.js voice:clone --file audio.mp3 [--name "Voice Name"] [--description "Description"]');
          process.exit(1);
        }
        
        console.error(`Cloning voice from: ${parsed.file}`);
        const options = {};
        if (parsed.name) options.voiceName = parsed.name;
        if (parsed.description) options.description = parsed.description;
        
        const result = await cloneVoiceFromFile(parsed.file, options);
        console.error(`Voice cloned successfully!`);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'voice:design': {
        // Allow description as positional arg or --description flag
        const description = parsed.description || parsed._.slice(1).join(' ');
        
        if (!description || description.trim().length < 20) {
          console.error('Error: Voice description is required (minimum 20 characters)');
          console.error('Usage: cli.js voice:design --description "A warm, friendly female voice with a slight British accent"');
          console.error('   or: cli.js voice:design "A warm, friendly female voice with a slight British accent"');
          process.exit(1);
        }
        
        console.error(`Designing voice with description: "${description}"`);
        const result = await designVoice(description);
        console.error(`Voice design generated ${result.previews?.length || 0} preview(s)!`);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'wallets': {
        const result = await listWallets();
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'wallets:create': {
        if (!parsed.chain) {
          console.error('Error: --chain is required');
          process.exit(1);
        }
        const result = await createWallet({
          chain: parsed.chain,
          custodian: parsed.custodian,
        });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'wallets:balance': {
        if (!parsed.address) {
          console.error('Error: --address is required');
          process.exit(1);
        }
        const result = await getWalletBalance(parsed.address);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'avatar:update': {
        const data = {};
        if (parsed.url) data.avatar_url = parsed.url;
        if (parsed.original) data.original_photo_url = parsed.original;
        if (Object.keys(data).length === 0) {
          console.error('Error: At least one option is required (--url or --original)');
          process.exit(1);
        }
        const result = await updateAvatar(data);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'training': {
        const options = {
          limit: parsed.limit ? parseInt(parsed.limit, 10) : 50,
          offset: parsed.offset ? parseInt(parsed.offset, 10) : 0,
        };
        const result = await listTrainingSessions(options);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      // ============== Agent Friends Commands (agent-level) ==============
      
      case 'agent:friends': {
        const options = {};
        if (parsed.status) options.status = parsed.status;
        if (parsed.type) options.type = parsed.type;
        if (parsed.favorites) options.favoritesOnly = true;

        const result = await listAgentFriendships(options);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'agent:friends:add': {
        if (!parsed.id) {
          console.error('Error: --id is required');
          console.error(
            'Usage: cli.js agent:friends:add --id <user_or_agent_id> [--type user|agent]',
          );
          process.exit(1);
        }

        const data = {
          targetId: parsed.id,
          targetType: parsed.type || 'user',
        };

        const result = await sendAgentFriendRequest(data);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'agent:friends:accept': {
        if (!parsed.id) {
          console.error('Error: --id is required');
          console.error(
            'Usage: cli.js agent:friends:accept --id <friendship_id>',
          );
          process.exit(1);
        }

        const result = await acceptAgentFriendRequest(parsed.id);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'agent:friends:reject': {
        if (!parsed.id) {
          console.error('Error: --id is required');
          console.error(
            'Usage: cli.js agent:friends:reject --id <friendship_id>',
          );
          process.exit(1);
        }

        const result = await rejectAgentFriendRequest(parsed.id);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'agent:friends:remove': {
        if (!parsed.id) {
          console.error('Error: --id is required');
          console.error(
            'Usage: cli.js agent:friends:remove --id <friendship_id>',
          );
          process.exit(1);
        }

        const result = await removeAgentFriendship(parsed.id);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'friends:discover': {
        const query = parsed.query || parsed._.slice(1).join(' ');
        
        if (!query) {
          console.error('Error: --query is required');
          console.error('Usage: cli.js friends:discover --query "search term"');
          process.exit(1);
        }
        
        const result = await discoverFriends(query);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'friends:suggestions': {
        const result = await getFriendSuggestions();
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      // ============== Notifications Commands ==============
      
      case 'notifications': {
        const options = {};
        if (parsed.limit) options.limit = parseInt(parsed.limit, 10);
        if (parsed.cursor) options.cursor = parsed.cursor;
        
        const result = await getNotifications(options);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'notifications:read': {
        if (!parsed.id) {
          console.error('Error: --id is required');
          console.error('Usage: cli.js notifications:read --id <notification_id>');
          process.exit(1);
        }
        
        const result = await markNotificationRead(parsed.id);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      // ============== User & Twins Commands ==============
      
      case 'user': {
        const result = await getUserInfo();
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'user:settings': {
        const result = await getUserSettings();
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'twins': {
        const result = await listUserTwins();
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      // ============== Composio Connections ==============

      case 'composio:connections': {
        const result = await listComposioConnections();
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
