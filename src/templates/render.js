/**
 * Simple template rendering engine
 * Supports Handlebars-like syntax: {{variable}}, {{#if}}, {{#each}}, {{json}}
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get a nested value from an object using dot notation
 * @param {object} obj - The object to get the value from
 * @param {string} path - Dot-notation path (e.g., "twin.name")
 * @returns {*} The value at the path, or empty string if not found
 */
function getValue(obj, pathStr) {
  if (!pathStr || !obj) return "";
  
  const parts = pathStr.trim().split(".");
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) return "";
    current = current[part];
  }
  
  return current ?? "";
}

/**
 * Check if a value is truthy for template conditionals
 * @param {*} value - The value to check
 * @returns {boolean}
 */
function isTruthy(value) {
  if (value === null || value === undefined) return false;
  if (value === false || value === 0 || value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === "object" && Object.keys(value).length === 0) return false;
  return true;
}

/**
 * Render a template string with the given context
 * @param {string} template - The template string
 * @param {object} context - The data context
 * @returns {string} The rendered string
 */
export function renderTemplate(template, context) {
  let result = template;
  
  // Process {{#each items}}...{{/each}} blocks
  result = processEachBlocks(result, context);
  
  // Process {{#if condition}}...{{else}}...{{/if}} blocks
  result = processIfBlocks(result, context);
  
  // Process {{json variable}} helpers
  result = result.replace(/\{\{json\s+([^}]+)\}\}/g, (match, varPath) => {
    const value = getValue(context, varPath.trim());
    if (value === "" || value === null || value === undefined) return "";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  });
  
  // Process simple {{variable}} replacements
  result = result.replace(/\{\{([^#/}][^}]*)\}\}/g, (match, varPath) => {
    // Skip if it's a helper like {{json ...}}
    if (varPath.trim().startsWith("json ")) return match;
    
    const value = getValue(context, varPath.trim());
    return value === null || value === undefined ? "" : String(value);
  });
  
  // Clean up multiple consecutive blank lines (more than 2)
  result = result.replace(/\n{3,}/g, "\n\n");
  
  return result.trimEnd() + "\n";
}

/**
 * Process {{#each items}}...{{/each}} blocks
 */
function processEachBlocks(template, context) {
  const eachRegex = /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  
  return template.replace(eachRegex, (match, varPath, content) => {
    const items = getValue(context, varPath.trim());
    
    if (!Array.isArray(items) || items.length === 0) {
      return "";
    }
    
    return items.map((item, index) => {
      // Create a new context with "this" pointing to the current item
      const itemContext = {
        ...context,
        this: item,
        "@index": index,
        "@first": index === 0,
        "@last": index === items.length - 1,
      };
      
      // Recursively render the content with the item context
      return renderTemplate(content, itemContext).trimEnd();
    }).join("\n");
  });
}

/**
 * Process {{#if condition}}...{{else}}...{{/if}} blocks
 */
function processIfBlocks(template, context) {
  // Handle nested if blocks by processing from innermost to outermost
  let result = template;
  let prevResult = "";
  
  // Keep processing until no more changes (handles nested blocks)
  while (result !== prevResult) {
    prevResult = result;
    
    // Match the innermost if block (one that doesn't contain another #if)
    const ifRegex = /\{\{#if\s+([^}]+)\}\}((?:(?!\{\{#if)[\s\S])*?)\{\{\/if\}\}/g;
    
    result = result.replace(ifRegex, (match, condition, content) => {
      const value = getValue(context, condition.trim());
      const truthy = isTruthy(value);
      
      // Check for {{else}} block
      const elseParts = content.split(/\{\{else\}\}/);
      const ifContent = elseParts[0];
      const elseContent = elseParts[1] || "";
      
      return truthy ? ifContent : elseContent;
    });
  }
  
  return result;
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
  
  const template = fs.readFileSync(templatePath, "utf8");
  return renderTemplate(template, context);
}

/**
 * Render the AMIKO.md template
 * @param {object} twin - Twin data from API
 * @param {object} user - User data from API (optional)
 * @param {Array} docs - Array of doc objects (optional)
 * @returns {string} Rendered markdown
 */
export function renderAmikoMd(twin, user = null, docs = null) {
  return renderTemplateFile("AMIKO.md.tmpl", { twin, user, docs });
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
  
  return renderTemplateFile("DOC.md.tmpl", { doc: docWithDefaults });
}
