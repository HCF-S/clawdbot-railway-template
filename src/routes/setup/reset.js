import express from "express";
import fs from "node:fs";

export function createResetRouter(handlers) {
  const { requireApiToken, configPath } = handlers;
  const router = express.Router();

  router.post("/reset", requireApiToken, async (_req, res) => {
    try {
      fs.rmSync(configPath(), { force: true });
      res.type("text/plain").send("OK - deleted config file. You can rerun setup now.");
    } catch (err) {
      res.status(500).type("text/plain").send(String(err));
    }
  });

  return router;
}
