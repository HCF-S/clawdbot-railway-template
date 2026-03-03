/**
 * Amiko Platform API Library
 * Shared functions for interacting with the Amiko Platform
 */

import fs from 'node:fs';
import path from 'node:path';

// Configuration from environment (AMIKO_USER_TOKEN kept for backward compat)
const AMIKO_USER_ID = process.env.AMIKO_USER_ID || '';
const AMIKO_TWIN_ID = process.env.AMIKO_TWIN_ID || '';
const AMIKO_TWIN_TOKEN = process.env.AMIKO_TWIN_TOKEN || process.env.AMIKO_USER_TOKEN || '';
const AMIKO_PLATFORM_URL = process.env.AMIKO_PLATFORM_URL || 'https://platform.heyamiko.com';

/**
 * Get configuration, validating required env vars
 */
export function getConfig() {
  if (!AMIKO_TWIN_ID) {
    throw new Error('AMIKO_TWIN_ID environment variable is not set');
  }
  if (!AMIKO_TWIN_TOKEN) {
    throw new Error('AMIKO_TWIN_TOKEN environment variable is not set');
  }
  
  return {
    userId: AMIKO_USER_ID,
    twinId: AMIKO_TWIN_ID,
    token: AMIKO_TWIN_TOKEN,
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
 * Create a new document for the twin (text content)
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
 * Upload a document file to the twin's knowledge base
 * @param {Buffer|Blob|string} file - File data (Buffer, Blob, or file path)
 * @param {object} options - Options
 * @param {string} options.filename - Filename (required if file is Buffer/Blob)
 * @param {string} options.contentType - MIME type (optional, will be guessed from filename)
 * @returns {Promise<object>} - Upload result with file URL and metadata
 */
export async function uploadDoc(file, options = {}) {
  const config = getConfig();
  const formData = new FormData();
  
  // Handle different file input types
  if (typeof file === 'string') {
    // It's a file path
    const fileBuffer = fs.readFileSync(file);
    const filename = options.filename || path.basename(file);
    const ext = path.extname(filename).toLowerCase();
    const contentType = options.contentType || getMimeType(ext);
    const blob = new Blob([fileBuffer], { type: contentType });
    formData.append('file', blob, filename);
  } else if (Buffer.isBuffer(file)) {
    // It's a Buffer
    if (!options.filename) {
      throw new Error('filename is required when uploading a Buffer');
    }
    const ext = path.extname(options.filename).toLowerCase();
    const contentType = options.contentType || getMimeType(ext);
    const blob = new Blob([file], { type: contentType });
    formData.append('file', blob, options.filename);
  } else if (file instanceof Blob) {
    // It's already a Blob
    const filename = options.filename || 'document';
    formData.append('file', file, filename);
  } else {
    throw new Error('File must be a file path, Buffer, or Blob');
  }
  
  const response = await apiRequest(`/api/agents/${config.twinId}/docs/upload`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to upload doc: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Upload a document file from a file path
 * Convenience wrapper for uploadDoc
 * @param {string} filePath - Path to the file
 * @returns {Promise<object>} - Upload result
 */
export async function uploadDocFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return uploadDoc(filePath);
}

/**
 * Get MIME type from file extension
 * @param {string} ext - File extension (with or without dot)
 * @returns {string} - MIME type
 */
function getMimeType(ext) {
  const mimeTypes = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
    '.js': 'text/javascript',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
  };
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
  return mimeTypes[normalizedExt] || 'application/octet-stream';
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
 * Design a voice from a text description
 * Uses ElevenLabs Voice Design API to generate voice previews based on description
 * @param {string} description - Text description of the desired voice (min 20 chars)
 *   Example: "A warm, friendly female voice with a slight British accent, calm and reassuring"
 * @returns {Promise<object>} - Design result with voice previews (audio_base_64, generated_voice_id)
 */
export async function designVoice(description) {
  const config = getConfig();
  
  if (!description || description.trim().length < 20) {
    throw new Error('Voice description must be at least 20 characters long');
  }
  
  const response = await apiRequest(`/api/agents/${config.twinId}/voice/design`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voiceDescription: description }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to design voice: ${response.status} - ${text}`);
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

// ============================================================================
// FRIENDS DISCOVERY API (read-only, user-level; twin acts as viewer)
// ============================================================================

/**
 * Search for users or agents to add as friends
 * @param {string} query - Search query
 * @param {object} options - Options
 * @param {string} options.type - 'user' or 'agent' (default: 'user')
 * @returns {Promise<object>} - Search results
 */
export async function searchFriends(query, options = {}) {
  const { type = 'user' } = options;
  
  if (!query || query.trim().length < 1) {
    throw new Error('Search query is required');
  }
  
  const params = new URLSearchParams();
  params.append('q', query);
  params.append('type', type);
  
  const response = await apiRequest(`/api/friends/search?${params.toString()}`);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to search: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Simple search for users (returns users and twins combined)
 * @param {string} query - Search query (optional, returns recent users if empty)
 * @returns {Promise<object>} - Search results
 */
export async function simpleSearchUsers(query = '') {
  const params = new URLSearchParams();
  if (query) params.append('q', query);
  
  const queryString = params.toString();
  const response = await apiRequest(`/api/friends/simple-search${queryString ? `?${queryString}` : ''}`);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to search: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Discover users and agents (combined search)
 * @param {string} query - Search query
 * @returns {Promise<object>} - Combined results of users and agents
 */
export async function discoverFriends(query) {
  if (!query || query.trim().length < 1) {
    throw new Error('Search query is required');
  }
  
  const params = new URLSearchParams();
  params.append('q', query);
  
  const response = await apiRequest(`/api/friends/discover?${params.toString()}`);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to discover: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Get friend suggestions (users who are not yet friends)
 * @returns {Promise<object>} - Suggested users to add as friends
 */
export async function getFriendSuggestions() {
  const response = await apiRequest('/api/friends/suggestions');
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get suggestions: ${response.status} - ${text}`);
  }
  
  return response.json();
}

// ============================================================================
// NOTIFICATIONS API (User-level operations)
// ============================================================================

/**
 * Get notifications for the user
 * @param {object} options - Options
 * @param {string} options.cursor - Cursor for pagination (ISO date string)
 * @param {number} options.limit - Number of notifications to return (default: 20)
 * @returns {Promise<object>} - Notifications with pagination info
 */
export async function getNotifications(options = {}) {
  const { cursor, limit = 20 } = options;
  
  const params = new URLSearchParams();
  if (cursor) params.append('cursor', cursor);
  if (limit) params.append('limit', String(limit));
  
  const queryString = params.toString();
  const response = await apiRequest(`/api/notifications${queryString ? `?${queryString}` : ''}`);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get notifications: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Mark a notification as read
 * @param {string} notificationId - ID of the notification to mark as read
 * @returns {Promise<object>} - Result
 */
export async function markNotificationRead(notificationId) {
  if (!notificationId) {
    throw new Error('notificationId is required');
  }
  
  const response = await apiRequest('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notificationId }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to mark notification as read: ${response.status} - ${text}`);
  }
  
  return response.json();
}

// ============================================================================
// USER API (User-level operations)
// ============================================================================

/**
 * Get current user's basic information
 * @returns {Promise<object>} - User data
 */
export async function getUserInfo() {
  const response = await apiRequest('/api/user/me');
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get user info: ${response.status} - ${text}`);
  }
  
  return response.json();
}

/**
 * Get user settings (more detailed than getUserInfo)
 * @returns {Promise<object>} - User settings
 */
export async function getUserSettings() {
  const response = await apiRequest('/api/user/settings');
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get user settings: ${response.status} - ${text}`);
  }
  
  return response.json();
}

// ============================================================================
// COMPOSIO CONNECTIONS API (Twin-level - list connected services)
// ============================================================================

/**
 * List Composio-connected services for this twin
 * Returns all connected apps (Gmail, Slack, GitHub, Spotify, etc.) with status
 * @returns {Promise<object>} - { connections: string[], details: Array<{appName, status, id, updatedAt}> }
 */
export async function listComposioConnections() {
  const config = getConfig();

  const response = await apiRequest(`/api/agents/${config.twinId}/composio/connections`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list Composio connections: ${response.status} - ${text}`);
  }

  return response.json();
}

// ============================================================================
// TWINS API (User-level operations - list all user's twins)
// ============================================================================

/**
 * Get all twins owned by the user
 * @returns {Promise<Array>} - Array of twins
 */
export async function listUserTwins() {
  const response = await apiRequest('/api/twins');
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list twins: ${response.status} - ${text}`);
  }
  
  return response.json();
}

// ============================================================================
// AGENT FRIENDSHIPS API (Agent-level operations - twin acts as social actor)
// ============================================================================

/**
 * List friendships for the twin (agent as social actor)
 * @param {object} options - Options
 * @param {string} options.status - Filter by status: 'accepted' | 'pending' | 'blocked' (optional)
 * @param {string} options.type - Filter by type: 'user' | 'agent' (optional)
 * @param {boolean} options.favoritesOnly - Only return favorites (optional)
 * @returns {Promise<object>} - Friendships list from the agent's perspective
 */
export async function listAgentFriendships(options = {}) {
  const config = getConfig();
  const { status, type, favoritesOnly } = options;

  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (type) params.append('type', type);
  if (favoritesOnly) params.append('favorites_only', 'true');

  const queryString = params.toString();
  const url = `/api/agents/${config.twinId}/friendships${queryString ? `?${queryString}` : ''}`;

  const response = await apiRequest(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list agent friendships: ${response.status} - ${text}`);
  }

  return response.json();
}

/**
 * Send a friend request from the twin (agent) to a user or another agent
 * @param {object} data - Request data
 * @param {string} data.targetId - ID of the user or agent to befriend
 * @param {('user'|'agent')} data.targetType - Target type: 'user' or 'agent'
 * @returns {Promise<object>} - Result with friendship_id
 */
export async function sendAgentFriendRequest(data) {
  const config = getConfig();
  const { targetId, targetType } = data;

  if (!targetId) {
    throw new Error('targetId is required');
  }
  if (!targetType || (targetType !== 'user' && targetType !== 'agent')) {
    throw new Error("targetType must be 'user' or 'agent'");
  }

  const response = await apiRequest(`/api/agents/${config.twinId}/friendships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target_id: targetId,
      target_type: targetType,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send agent friend request: ${response.status} - ${text}`);
  }

  return response.json();
}

/**
 * Internal helper to update an agent friendship with a specific action
 * @param {string} friendshipId - Friendship ID
 * @param {('accept'|'reject'|'block'|'favorite'|'unfavorite')} action - Action to perform
 * @returns {Promise<object>} - Result
 */
async function updateAgentFriendship(friendshipId, action) {
  const config = getConfig();

  if (!friendshipId) {
    throw new Error('friendshipId is required');
  }
  if (!action) {
    throw new Error('action is required');
  }

  const response = await apiRequest(
    `/api/agents/${config.twinId}/friendships/${friendshipId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to update agent friendship (${action}): ${response.status} - ${text}`,
    );
  }

  return response.json();
}

/**
 * Accept an incoming friend request for the twin
 * @param {string} friendshipId - Friendship ID to accept
 * @returns {Promise<object>} - Result
 */
export async function acceptAgentFriendRequest(friendshipId) {
  return updateAgentFriendship(friendshipId, 'accept');
}

/**
 * Reject an incoming friend request for the twin
 * @param {string} friendshipId - Friendship ID to reject
 * @returns {Promise<object>} - Result
 */
export async function rejectAgentFriendRequest(friendshipId) {
  return updateAgentFriendship(friendshipId, 'reject');
}

/**
 * Remove an existing friendship for the twin (any status)
 * @param {string} friendshipId - Friendship ID to remove
 * @returns {Promise<object>} - Result
 */
export async function removeAgentFriendship(friendshipId) {
  const config = getConfig();

  if (!friendshipId) {
    throw new Error('friendshipId is required');
  }

  const response = await apiRequest(
    `/api/agents/${config.twinId}/friendships/${friendshipId}`,
    {
      method: 'DELETE',
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to remove agent friendship: ${response.status} - ${text}`,
    );
  }

  return response.json();
}
