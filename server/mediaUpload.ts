import type { Express, Request, Response } from "express";
import express from "express";
import { sdk } from "./_core/sdk";
import { acceptedMediaTypes } from "./projects";
import { storagePut } from "./storage";

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 180) || "property-media";
}

export function registerProjectMediaUpload(app: Express) {
  app.post(
    "/api/project-media",
    express.raw({ type: "*/*", limit: "25mb" }),
    async (req: Request, res: Response) => {
      try {
        const user = await sdk.authenticateRequest(req);
        if (!user) {
          res.status(401).json({ error: "Sign in to upload property media." });
          return;
        }

        const fileName = typeof req.query.filename === "string" ? req.query.filename : "property-media";
        const mimeType = typeof req.query.mime === "string" ? req.query.mime : req.headers["content-type"] || "";
        if (!acceptedMediaTypes.includes(mimeType as (typeof acceptedMediaTypes)[number])) {
          res.status(400).json({ error: "Use JPG, PNG, WEBP, MP4, or MOV media files." });
          return;
        }
        if (!Buffer.isBuffer(req.body) || req.body.byteLength === 0) {
          res.status(400).json({ error: "The uploaded media could not be read." });
          return;
        }
        if (req.body.byteLength > MAX_MEDIA_BYTES) {
          res.status(413).json({ error: "Keep the combined upload size under 25 MB." });
          return;
        }

        const asset = await storagePut(
          `property-projects/${user.id}/${Date.now()}-${safeFileName(fileName)}`,
          req.body,
          mimeType,
        );
        res.status(201).json({ name: fileName, type: mimeType, key: asset.key, url: asset.url });
      } catch (error) {
        console.error("[Project media upload]", error);
        res.status(500).json({ error: "We could not secure this media. Please try again." });
      }
    },
  );
}
