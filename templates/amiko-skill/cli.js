#!/usr/bin/env node

/**
 * Amiko Skill CLI
 * Command-line interface for interacting with Amiko Platform APIs
 */

import { 
  getConfig, 
  getTwinInfo, 
  listDocs, 
  generateVoice, 
  generateVoiceToFile 
} from './lib.js';

const args = process.argv.slice(2);
const command = args[0];

function printUsage() {
  console.log(`
Amiko Skill CLI - Interact with Amiko Platform

Usage:
  cli.js <command> [options]

Commands:
  voice <text>     Generate speech using your twin's cloned voice
                   Options:
                     --output <file>  Save to file (default: base64 to stdout)
                     --model <id>     ElevenLabs model ID
  
  info             Get your twin's profile information
  
  docs             List documents associated with your twin
                   Options:
                     --limit <n>      Number of docs (default: 50)
                     --offset <n>     Pagination offset (default: 0)
  
  help             Show this help message

Environment Variables:
  AMIKO_TWIN_ID       Your twin's unique ID (required)
  AMIKO_USER_TOKEN    Authentication token (required)
  AMIKO_PLATFORM_URL  Platform URL (default: https://platform.heyamiko.com)

Examples:
  cli.js voice "Hello, this is my digital twin!"
  cli.js voice "Hello world" --output hello.mp3
  cli.js info
  cli.js docs --limit 10
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
      case 'voice': {
        const parsed = parseArgs(args.slice(1));
        const text = parsed._.join(' ');
        
        if (!text) {
          console.error('Error: Text is required for voice generation');
          console.error('Usage: cli.js voice "Your text here"');
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
      
      case 'info': {
        const twin = await getTwinInfo();
        console.log(JSON.stringify(twin, null, 2));
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
