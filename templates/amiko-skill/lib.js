/**
 * Amiko Platform API Library
 * Shared functions for interacting with the Amiko Platform
 */

import fs from 'node:fs';
import path from 'node:path';

// Configuration from environment
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
