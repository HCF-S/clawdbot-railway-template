import express from "express";

// Both amiko and composio skills are now bundled in the openclaw-amiko-plugin extension.
// This file is kept for the createSkillsRouter export (future skill management endpoints).

/**
 * Create the skills router
 */
export function createSkillsRouter(_handlers) {
  const router = express.Router();
  // Future skill management endpoints can be added here
  return router;
}
