#!/usr/bin/env node

/**
 * Amiko Skill CLI
 * Command-line interface for interacting with Amiko Platform APIs
 */

import { 
  getConfig, 
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
} from './lib.js';

const args = process.argv.slice(2);
const command = args[0];

function printUsage() {
  console.log(`
Amiko Skill CLI - Interact with Amiko Platform

Usage:
  cli.js <command> [options]

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
  
  personality:update Update twin personality
                     Options:
                       --text <text>    Personality description (required)
  
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
  
  help               Show this help message

Environment Variables:
  AMIKO_USER_ID       Your user's unique ID
  AMIKO_TWIN_ID       Your twin's unique ID (required)
  AMIKO_USER_TOKEN    Authentication token (required)
  AMIKO_PLATFORM_URL  Platform URL (default: https://platform.heyamiko.com)

Examples:
  cli.js info
  cli.js stats --details
  cli.js docs --limit 10
  cli.js docs:create --title "My Note" --content "Hello world"
  cli.js personality
  cli.js voice:generate "Hello, this is my digital twin!"
  cli.js voice:generate "Hello world" --output hello.mp3
  cli.js wallets
  cli.js wallets:balance --address 0x123...
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
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  try {
    // Validate config early
    getConfig();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error('Make sure AMIKO_TWIN_ID and AMIKO_USER_TOKEN are set.');
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
        const parsed = parseArgs(args.slice(1));
        const options = { details: !!parsed.details };
        const stats = await getTwinStats(options);
        console.log(JSON.stringify(stats, null, 2));
        break;
      }
      
      case 'docs': {
        const parsed = parseArgs(args.slice(1));
        const options = {
          limit: parsed.limit ? parseInt(parsed.limit, 10) : 50,
          offset: parsed.offset ? parseInt(parsed.offset, 10) : 0,
        };
        const result = await listDocs(options);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'docs:create': {
        const parsed = parseArgs(args.slice(1));
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
        const parsed = parseArgs(args.slice(1));
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
        const parsed = parseArgs(args.slice(1));
        if (!parsed.text) {
          console.error('Error: --text is required');
          process.exit(1);
        }
        const result = await updatePersonality(parsed.text);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'social': {
        const result = await getSocial();
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'social:update': {
        const parsed = parseArgs(args.slice(1));
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
        const parsed = parseArgs(args.slice(1));
        const text = parsed._.join(' ');
        
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
        const parsed = parseArgs(args.slice(1));
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
        const parsed = parseArgs(args.slice(1));
        // Allow description as positional arg or --description flag
        const description = parsed.description || parsed._.join(' ');
        
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
        const parsed = parseArgs(args.slice(1));
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
        const parsed = parseArgs(args.slice(1));
        if (!parsed.address) {
          console.error('Error: --address is required');
          process.exit(1);
        }
        const result = await getWalletBalance(parsed.address);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      
      case 'avatar:update': {
        const parsed = parseArgs(args.slice(1));
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
        const parsed = parseArgs(args.slice(1));
        const options = {
          limit: parsed.limit ? parseInt(parsed.limit, 10) : 50,
          offset: parsed.offset ? parseInt(parsed.offset, 10) : 0,
        };
        const result = await listTrainingSessions(options);
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
