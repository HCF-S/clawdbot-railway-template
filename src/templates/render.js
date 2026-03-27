/**
 * Template rendering using Handlebars
 */

import Handlebars from "handlebars";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Register custom helpers

/**
 * JSON stringify helper
 * Usage: {{json variable}}
 */
Handlebars.registerHelper("json", function(context) {
  if (context === null || context === undefined) return "";
  try {
    return JSON.stringify(context, null, 2);
  } catch {
    return String(context);
  }
});

/**
 * Check if array has items
 * Usage: {{#if (hasItems array)}}...{{/if}}
 */
Handlebars.registerHelper("hasItems", function(array) {
  return Array.isArray(array) && array.length > 0;
});

/**
 * Format date helper
 * Usage: {{formatDate date}}
 */
Handlebars.registerHelper("formatDate", function(date) {
  if (!date) return "";
  try {
    return new Date(date).toISOString();
  } catch {
    return String(date);
  }
});

// Cache compiled templates
const templateCache = new Map();

/**
 * Render a template string with the given context
 * @param {string} template - The template string
 * @param {object} context - The data context
 * @returns {string} The rendered string
 */
export function renderTemplate(template, context) {
  const compiled = Handlebars.compile(template);
  return compiled(context);
}

/**
 * Load and render a template file
 * @param {string} templateName - Name of the template file (e.g., "AMIKO.md.tmpl")
 * @param {object} context - The data context
 * @returns {string} The rendered string
 */
export function renderTemplateFile(templateName, context) {
  const templatePath = path.join(__dirname, templateName);
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  
  // Check cache
  let compiled = templateCache.get(templatePath);
  if (!compiled) {
    const template = fs.readFileSync(templatePath, "utf8");
    compiled = Handlebars.compile(template);
    templateCache.set(templatePath, compiled);
  }
  
  return compiled(context);
}

/**
 * Render the AMIKO.md template
 * @param {object} twin - Twin data from API
 * @param {object} user - User data from API (optional)
 * @param {Array} docs - Array of doc objects (optional)
 * @returns {string} Rendered markdown
 */
export function renderAmikoMd(twin, user = null, docs = null) {
  return renderTemplateFile("workspace/AMIKO.md.tmpl", { twin, user, docs });
}

/**
 * Render the BOOTSTRAP.md template
 * @param {object} user - User data (needs at least { name })
 * @returns {string} Rendered markdown
 */
export function renderBootstrapMd(user = {}) {
  return renderTemplateFile("workspace/BOOTSTRAP.md.tmpl", { user });
}

/**
 * Render the DOC.md template
 * @param {object} doc - Document data from API
 * @returns {string} Rendered markdown
 */
export function renderDocMd(doc) {
  // Set defaults for missing values
  const docWithDefaults = {
    title: doc.title || doc.filename || "Untitled Document",
    filename: doc.filename || "N/A",
    doc_type: doc.doc_type || "N/A",
    file_type: doc.file_type || "N/A",
    relationship: doc.relationship || "N/A",
    stance: doc.stance || "N/A",
    created_at: doc.created_at || "N/A",
    updated_at: doc.updated_at || "N/A",
    is_parsed: doc.is_parsed || false,
    is_processed: doc.is_processed || false,
    chunk_count: doc.chunk_count || 0,
    ...doc,
  };
  
  return renderTemplateFile("workspace/DOC.md.tmpl", { doc: docWithDefaults });
}

/**
 * Render the MEMORIES.md template
 * @param {Array} memories - Array of memory objects from API
 * @param {string} twinId - Twin ID
 * @returns {string} Rendered markdown
 */
export function renderMemoriesMd(memories, twinId) {
  // Group memories by type for better organization
  const memoriesByType = {};
  for (const memory of memories) {
    const type = memory.type || "GENERAL";
    if (!memoriesByType[type]) {
      memoriesByType[type] = [];
    }
    memoriesByType[type].push(memory);
  }
  
  return renderTemplateFile("workspace/MEMORIES.md.tmpl", { 
    memories, 
    memoriesByType,
    twinId,
    syncedAt: new Date().toISOString(),
  });
}
