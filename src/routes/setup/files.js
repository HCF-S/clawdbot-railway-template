import express from "express";
import fs from "node:fs";
import path from "node:path";

// Base directory for file operations - restricted to /data
const DATA_DIR = "/data";

/**
 * Validate and resolve a path within /data
 * Prevents directory traversal attacks
 * @param {string} relativePath - Path relative to /data
 * @returns {{ ok: boolean, fullPath?: string, error?: string }}
 */
function resolveSafePath(relativePath) {
  if (!relativePath) {
    return { ok: false, error: "Path is required" };
  }

  // Normalize and resolve the path
  const normalized = path.normalize(relativePath).replace(/^\/+/, "");
  const fullPath = path.join(DATA_DIR, normalized);

  // Ensure the resolved path is still within /data
  if (!fullPath.startsWith(DATA_DIR + "/") && fullPath !== DATA_DIR) {
    return { ok: false, error: "Path must be within /data" };
  }

  return { ok: true, fullPath };
}

/**
 * Get file/directory stats
 */
function getStats(fullPath) {
  try {
    const stat = fs.statSync(fullPath);
    return {
      exists: true,
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      ctime: stat.ctime.toISOString(),
    };
  } catch {
    return { exists: false };
  }
}

export function createFilesRouter(handlers) {
  const { requireApiToken } = handlers;
  const router = express.Router();

  /**
   * GET /setup/api/files/list
   * List files and directories in a path
   * Query params: path (relative to /data, default: "/")
   */
  router.get("/files/list", requireApiToken, (req, res) => {
    try {
      const relativePath = req.query.path || "/";
      const resolved = resolveSafePath(relativePath);

      if (!resolved.ok) {
        return res.status(400).json({ ok: false, error: resolved.error });
      }

      const { fullPath } = resolved;

      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ ok: false, error: "Path not found" });
      }

      const stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) {
        return res.status(400).json({ ok: false, error: "Path is not a directory" });
      }

      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      const items = entries.map((entry) => {
        const entryPath = path.join(fullPath, entry.name);
        const entryStat = getStats(entryPath);
        return {
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file",
          size: entryStat.size || 0,
          mtime: entryStat.mtime,
        };
      });

      // Sort: directories first, then files, alphabetically
      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return res.json({
        ok: true,
        path: relativePath,
        items,
      });
    } catch (err) {
      console.error("[/setup/api/files/list] error:", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  /**
   * GET /setup/api/files/read
   * Read a file's content
   * Query params: path (relative to /data)
   */
  router.get("/files/read", requireApiToken, (req, res) => {
    try {
      const relativePath = req.query.path;
      if (!relativePath) {
        return res.status(400).json({ ok: false, error: "Path is required" });
      }

      const resolved = resolveSafePath(relativePath);
      if (!resolved.ok) {
        return res.status(400).json({ ok: false, error: resolved.error });
      }

      const { fullPath } = resolved;

      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ ok: false, error: "File not found" });
      }

      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) {
        return res.status(400).json({ ok: false, error: "Path is not a file" });
      }

      // Check file size - limit to 10MB for safety
      const MAX_SIZE = 10 * 1024 * 1024;
      if (stat.size > MAX_SIZE) {
        return res.status(400).json({
          ok: false,
          error: `File too large (${stat.size} bytes). Max: ${MAX_SIZE} bytes`,
        });
      }

      // Try to read as text, fall back to base64 for binary
      let content;
      let encoding = "utf8";

      try {
        content = fs.readFileSync(fullPath, "utf8");
        // Check if content looks like binary (has null bytes or too many non-printable chars)
        const nonPrintable = content.match(/[\x00-\x08\x0E-\x1F]/g);
        if (nonPrintable && nonPrintable.length > content.length * 0.1) {
          // More than 10% non-printable, treat as binary
          content = fs.readFileSync(fullPath).toString("base64");
          encoding = "base64";
        }
      } catch {
        // If UTF-8 read fails, read as binary
        content = fs.readFileSync(fullPath).toString("base64");
        encoding = "base64";
      }

      return res.json({
        ok: true,
        path: relativePath,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        encoding,
        content,
      });
    } catch (err) {
      console.error("[/setup/api/files/read] error:", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  /**
   * POST /setup/api/files/write
   * Write content to a file (creates or replaces)
   * Body: { path: string, content: string, encoding?: "utf8" | "base64", mkdir?: boolean }
   */
  router.post("/files/write", requireApiToken, (req, res) => {
    try {
      const { path: relativePath, content, encoding = "utf8", mkdir = true } = req.body || {};

      if (!relativePath) {
        return res.status(400).json({ ok: false, error: "Path is required" });
      }

      if (content === undefined || content === null) {
        return res.status(400).json({ ok: false, error: "Content is required" });
      }

      const resolved = resolveSafePath(relativePath);
      if (!resolved.ok) {
        return res.status(400).json({ ok: false, error: resolved.error });
      }

      const { fullPath } = resolved;

      // Check if parent directory exists
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        if (mkdir) {
          fs.mkdirSync(parentDir, { recursive: true });
        } else {
          return res.status(400).json({
            ok: false,
            error: `Parent directory does not exist: ${path.dirname(relativePath)}`,
          });
        }
      }

      // Check if it's a directory
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        return res.status(400).json({ ok: false, error: "Cannot write to a directory" });
      }

      // Write the file
      const existed = fs.existsSync(fullPath);
      if (encoding === "base64") {
        fs.writeFileSync(fullPath, Buffer.from(content, "base64"));
      } else {
        fs.writeFileSync(fullPath, content, "utf8");
      }

      const stat = fs.statSync(fullPath);

      return res.json({
        ok: true,
        path: relativePath,
        created: !existed,
        replaced: existed,
        size: stat.size,
      });
    } catch (err) {
      console.error("[/setup/api/files/write] error:", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  /**
   * DELETE /setup/api/files/delete
   * Delete a file or empty directory
   * Query params: path (relative to /data)
   */
  router.delete("/files/delete", requireApiToken, (req, res) => {
    try {
      const relativePath = req.query.path;
      if (!relativePath) {
        return res.status(400).json({ ok: false, error: "Path is required" });
      }

      const resolved = resolveSafePath(relativePath);
      if (!resolved.ok) {
        return res.status(400).json({ ok: false, error: resolved.error });
      }

      const { fullPath } = resolved;

      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ ok: false, error: "Path not found" });
      }

      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Only delete empty directories for safety
        const entries = fs.readdirSync(fullPath);
        if (entries.length > 0) {
          return res.status(400).json({
            ok: false,
            error: "Directory is not empty. Delete contents first.",
          });
        }
        fs.rmdirSync(fullPath);
      } else {
        fs.unlinkSync(fullPath);
      }

      return res.json({
        ok: true,
        path: relativePath,
        deleted: true,
        type: stat.isDirectory() ? "directory" : "file",
      });
    } catch (err) {
      console.error("[/setup/api/files/delete] error:", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  /**
   * POST /setup/api/files/mkdir
   * Create a directory
   * Body: { path: string }
   */
  router.post("/files/mkdir", requireApiToken, (req, res) => {
    try {
      const { path: relativePath } = req.body || {};

      if (!relativePath) {
        return res.status(400).json({ ok: false, error: "Path is required" });
      }

      const resolved = resolveSafePath(relativePath);
      if (!resolved.ok) {
        return res.status(400).json({ ok: false, error: resolved.error });
      }

      const { fullPath } = resolved;

      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          return res.json({
            ok: true,
            path: relativePath,
            created: false,
            message: "Directory already exists",
          });
        } else {
          return res.status(400).json({
            ok: false,
            error: "A file with this name already exists",
          });
        }
      }

      fs.mkdirSync(fullPath, { recursive: true });

      return res.json({
        ok: true,
        path: relativePath,
        created: true,
      });
    } catch (err) {
      console.error("[/setup/api/files/mkdir] error:", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  /**
   * GET /setup/api/files/stat
   * Get file or directory stats
   * Query params: path (relative to /data)
   */
  router.get("/files/stat", requireApiToken, (req, res) => {
    try {
      const relativePath = req.query.path;
      if (!relativePath) {
        return res.status(400).json({ ok: false, error: "Path is required" });
      }

      const resolved = resolveSafePath(relativePath);
      if (!resolved.ok) {
        return res.status(400).json({ ok: false, error: resolved.error });
      }

      const { fullPath } = resolved;
      const stats = getStats(fullPath);

      if (!stats.exists) {
        return res.status(404).json({ ok: false, error: "Path not found" });
      }

      return res.json({
        ok: true,
        path: relativePath,
        ...stats,
      });
    } catch (err) {
      console.error("[/setup/api/files/stat] error:", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
