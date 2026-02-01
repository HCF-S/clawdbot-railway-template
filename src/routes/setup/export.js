import express from "express";
import fs from "node:fs";
import path from "node:path";
import * as tar from "tar";

export function createExportRouter(handlers) {
  const { requireApiToken, STATE_DIR, WORKSPACE_DIR } = handlers;
  const router = express.Router();

  router.get("/export", requireApiToken, async (_req, res) => {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

    res.setHeader("content-type", "application/gzip");
    res.setHeader(
      "content-disposition",
      `attachment; filename="openclaw-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.tar.gz"`,
    );

    const stateAbs = path.resolve(STATE_DIR);
    const workspaceAbs = path.resolve(WORKSPACE_DIR);

    const dataRoot = "/data";
    const underData = (p) => p === dataRoot || p.startsWith(dataRoot + path.sep);

    let cwd = "/";
    let paths = [stateAbs, workspaceAbs].map((p) => p.replace(/^\//, ""));

    if (underData(stateAbs) && underData(workspaceAbs)) {
      cwd = dataRoot;
      paths = [
        path.relative(dataRoot, stateAbs) || ".",
        path.relative(dataRoot, workspaceAbs) || ".",
      ];
    }

    const stream = tar.c(
      {
        gzip: true,
        portable: true,
        noMtime: true,
        cwd,
        onwarn: () => {},
      },
      paths,
    );

    stream.on("error", (err) => {
      console.error("[export]", err);
      if (!res.headersSent) res.status(500);
      res.end(String(err));
    });

    stream.pipe(res);
  });

  return router;
}
