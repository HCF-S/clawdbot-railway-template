/**
 * Amiko Platform API Library
 * Shared functions for interacting with the Amiko Platform
 */

import fs from 'node:fs';
import path from 'node:path';

// Configuration from environment
const AMIKO_USER_ID = process.env.AMIKO_USER_ID || '';
const AMIKO_TWIN_ID = process.env.AMIKO_TWIN_ID || '';
const AMIKO_USER_TOKEN = process.env.AMIKO_USER_TOKEN || '';
const AMIKO_PLATFORM_URL = process.env.AMIKO_PLATFORM_URL || 'https://platform.heyamiko.com';

/**
 * Get configuration, validating required env vars
 */
export function getConfig() {
  if (!AMIKO_TWIN_ID) {
    throw new Error('AMIKO_TWIN_ID environment variable is not set');
  }
  if (!AMIKO_USER_TOKEN) {
    throw new Error('AMIKO_USER_TOKEN environment variable is not set');
  }
  
  return {
    userId: AMIKO_USER_ID,
    twinId: AMIKO_TWIN_ID,
    token: AMIKO_USER_TOKEN,
    baseUrl: AMIKO_PLATFORM_URL,
  };
}

/**
 * Make an authenticated API request to Amiko Platform
 */
export async function apiRequest(endpoint, options = {}) {
  const config = getConfig();
  const url = `${config.baseUrl}${endpoint}`;
  
  const headers = {
    'Authorization': `Bearer ${config.token}`,
    ...options.headers,
  };
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  return response;
}

/**
 * Get twin information
 */
export async function getTwinInfo() {
  const config = getConfig();
  const response = await apiRequest(`/api/agents/${config.twinId}`);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get twin info: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * List documents for the twin
 */
export async function listDocs(options = {}) {
  const config = getConfig();
  const { limit = 50, offset = 0 } = options;
  
  const url = `/api/agents/${config.twinId}/docs?limit=${limit}&offset=${offset}`;
  const response = await apiRequest(url);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list docs: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Generate voice audio from text using the twin's cloned voice
 * @param {string} text - Text to convert to speech
 * @param {object} options - Options
 * @param {string} options.modelId - ElevenLabs model ID
 * @returns {Promise<ArrayBuffer>} - Audio data as ArrayBuffer
 */
export async function generateVoice(text, options = {}) {
  const config = getConfig();
  const { modelId = 'eleven_multilingual_v2' } = options;
  
  const formData = new FormData();
  formData.append('text_to_generate', text);
  if (modelId) {
    formData.append('model_id', modelId);
  }
  
  const response = await apiRequest(`/api/agents/${config.twinId}/voice/generate`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to generate voice: ${response.status} - ${text}`);
  }
  
  return response.arrayBuffer();
}

/**
 * Generate voice and save to file
 * @param {string} text - Text to convert to speech
 * @param {string} outputPath - Path to save the audio file
 * @param {object} options - Options
 */
export async function generateVoiceToFile(text, outputPath, options = {}) {
  const audioBuffer = await generateVoice(text, options);
  const buffer = Buffer.from(audioBuffer);
  
  // Ensure directory exists
  const dir = path.dirname(outputPath);
  if (dir && dir !== '.') {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, buffer);
  return { path: outputPath, size: buffer.length };
}

/**
 * Get twin statistics (training progress, memory count, etc.)
 */
export async function getTwinStats(options = {}) {
  const config = getConfig();
  const { details = false } = options;
  
  const url = `/api/agents/${config.twinId}/stat${details ? '?details=true' : ''}`;
  const response = await apiRequest(url);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get twin stats: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Create a new document for the twin
 * @param {object} docData - Document data
 * @param {string} docData.title - Document title
 * @param {string} docData.content - Document content
 * @param {string} docData.type - Document type (e.g., 'text', 'note')
 */
export async function createDoc(docData) {
  const config = getConfig();
  
  const response = await apiRequest(`/api/agents/${config.twinId}/docs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(docData),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create doc: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Get twin personality data
 */
export async function getPersonality() {
  const config = getConfig();
  
  const response = await apiRequest(`/api/agents/${config.twinId}/personality`);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get personality: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Update twin personality
 * @param {string} personality - Personality text/description
 */
export async function updatePersonality(personality) {
  const config = getConfig();
  
  const response = await apiRequest(`/api/agents/${config.twinId}/personality`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personality }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update personality: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Get twin social data (Twitter handle, etc.)
 */
export async function getSocial() {
  const config = getConfig();
  
  const response = await apiRequest(`/api/agents/${config.twinId}/social`);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get social data: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Update twin social data
 * @param {object} socialData - Social data
 * @param {string} socialData.twitter_handle - Twitter handle
 * @param {object} socialData.personality_sphere - Personality sphere data
 */
export async function updateSocial(socialData) {
  const config = getConfig();
  
  const response = await apiRequest(`/api/agents/${config.twinId}/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(socialData),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update social data: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Get twin voice configuration
 */
export async function getVoice() {
  const config = getConfig();
  
  const response = await apiRequest(`/api/agents/${config.twinId}/voice`);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get voice data: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * List wallets for the twin
 */
export async function listWallets() {
  const config = getConfig();
  
  const response = await apiRequest(`/api/agents/${config.twinId}/wallets`);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list wallets: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Create a new wallet for the twin
 * @param {object} walletData - Wallet data
 * @param {string} walletData.chain - Blockchain chain (e.g., 'ethereum', 'polygon', 'solana-devnet')
 * @param {string} walletData.custodian - Custodian ('crossmint' or 'amiko')
 */
export async function createWallet(walletData) {
  const config = getConfig();
  
  const response = await apiRequest(`/api/agents/${config.twinId}/wallets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(walletData),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create wallet: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Get wallet balance
 * @param {string} address - Wallet address
 */
export async function getWalletBalance(address) {
  const config = getConfig();
  
  const response = await apiRequest(`/api/agents/${config.twinId}/wallets/${address}/balance`);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get wallet balance: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Update twin avatar
 * @param {object} avatarData - Avatar data
 * @param {string} avatarData.avatar_url - Avatar URL
 * @param {string} avatarData.original_photo_url - Original photo URL
 */
export async function updateAvatar(avatarData) {
  const config = getConfig();
  
  const response = await apiRequest(`/api/agents/${config.twinId}/avatar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(avatarData),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update avatar: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Get training sessions for the twin
 * @param {object} options - Options
 * @param {number} options.limit - Number of sessions to return
 * @param {number} options.offset - Offset for pagination
 */
export async function listTrainingSessions(options = {}) {
  const config = getConfig();
  const { limit = 50, offset = 0 } = options;
  
  const url = `/api/agents/${config.twinId}/training_sessions?limit=${limit}&offset=${offset}`;
  const response = await apiRequest(url);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list training sessions: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Clone voice from an audio file
 * Uses ElevenLabs Instant Voice Cloning (IVC) to create a voice from audio
 * @param {Buffer|Blob|string} audio - Audio data (Buffer, Blob, or file path)
 * @param {object} options - Options
 * @param {string} options.voiceName - Name for the cloned voice
 * @param {string} options.description - Description for the voice
 * @returns {Promise<object>} - Clone result with elevenlabs_voice_id
 */
export async function cloneVoice(audio, options = {}) {
  const config = getConfig();
  const { voiceName, description } = options;
  
  const formData = new FormData();
  
  // Handle different audio input types
  if (typeof audio === 'string') {
    // It's a file path
    const audioBuffer = fs.readFileSync(audio);
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    formData.append('audio', blob, path.basename(audio));
  } else if (Buffer.isBuffer(audio)) {
    // It's a Buffer
    const blob = new Blob([audio], { type: 'audio/mpeg' });
    formData.append('audio', blob, 'audio.mp3');
  } else if (audio instanceof Blob) {
    // It's already a Blob
    formData.append('audio', audio, 'audio.mp3');
  } else {
    throw new Error('Audio must be a file path, Buffer, or Blob');
  }
  
  if (voiceName) {
    formData.append('voice_name', voiceName);
  }
  if (description) {
    formData.append('description', description);
  }
  
  const response = await apiRequest(`/api/agents/${config.twinId}/voice/clone`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to clone voice: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Clone voice from a file path
 * Convenience wrapper for cloneVoice that reads from a file
 * @param {string} filePath - Path to the audio file
 * @param {object} options - Options
 * @param {string} options.voiceName - Name for the cloned voice
 * @param {string} options.description - Description for the voice
 */
export async function cloneVoiceFromFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }
  return cloneVoice(filePath, options);
}
