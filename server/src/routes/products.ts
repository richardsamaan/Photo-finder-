import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { products, searchResults, images, jobs } from "../db/schema.js";
import { newId } from "../lib/ids.js";
import { uploadImage } from "../middleware/upload.js";
import { searchAndVerifyProduct } from "../services/productSearch.js";
import {
  downloadAndStoreImage,
  persistImageBuffer,
  deleteStoredImage,
  resolveStoragePath,
} from "../services/imageStorage.js";
import { classifyConfidence } from "../services/verification.js";
import type { DomainFilterMode } from "../services/sourceTier.js";

export const productsRouter = Router();

function getProductOr404(req: any, res: any) {
  const product = db.select().from(products).where(eq(products.id, req.params.id)).get();
  if (!product) {
    res.status(404).json({ error: "Product not found." });
    return null;
  }
  return product;
}

productsRouter.get("/:id", (req, res) => {
  const product = getProductOr404(req, res);
  if (!product) return;
  const candidates = db
    .select()
    .from(searchResults)
    .where(eq(searchResults.productId, product.id))
    .all()
    .sort((a, b) => b.confidence - a.confidence);
  const productImages = db.select().from(images).where(eq(images.productId, product.id)).all();
  res.json({ product, candidates, images: productImages });
});

productsRouter.post("/:id/search-again", async (req, res) => {
  const product = getProductOr404(req, res);
  if (!product) return;

  const job = db.select().from(jobs).where(eq(jobs.id, product.jobId)).get();

  db.update(products)
    .set({ status: "searching", updatedAt: new Date().toISOString() })
    .where(eq(products.id, product.id))
    .run();

  try {
    const outcome = await searchAndVerifyProduct(
      { id: product.id, styleCode: product.styleCode, colour: product.colour, category: product.category },
      {
        useCache: false,
        domainFilterMode: (job?.domainFilterMode ?? "none") as DomainFilterMode,
        officialDomain: job?.officialDomain ?? null,
      }
    );
    if (product.localImagePath) {
      deleteStoredImage(resolveStoragePath(product.localImagePath));
    }
    db.update(products)
      .set({
        status: outcome.status,
        confidence: outcome.confidence,
        imageUrl: outcome.imageUrl,
        sourceUrl: outcome.sourceUrl,
        sourceName: outcome.sourceName,
        verificationNotes: JSON.stringify(outcome.candidates[0]?.evidence ?? []),
        errorMessage: null,
        searchPhase: outcome.attemptsUsed,
        localImagePath: null,
        filename: null,
        manuallyUploaded: false,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, product.id))
      .run();
    const updated = db.select().from(products).where(eq(products.id, product.id)).get();
    res.json({ product: updated, candidates: outcome.candidates });
  } catch (err) {
    db.update(products)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, product.id))
      .run();
    res.status(500).json({ error: err instanceof Error ? err.message : "Search failed." });
  }
});

const selectCandidateSchema = z.object({ candidateId: z.string().min(1) });

// "FIND ANOTHER IMAGE" - pick a different candidate from the already-found list
productsRouter.post("/:id/select-candidate", (req, res) => {
  const product = getProductOr404(req, res);
  if (!product) return;
  const parsed = selectCandidateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "candidateId is required." });

  const candidate = db
    .select()
    .from(searchResults)
    .where(eq(searchResults.id, parsed.data.candidateId))
    .get();
  if (!candidate || candidate.productId !== product.id) {
    return res.status(404).json({ error: "Candidate not found for this product." });
  }

  db.update(searchResults).set({ chosen: false }).where(eq(searchResults.productId, product.id)).run();
  db.update(searchResults).set({ chosen: true }).where(eq(searchResults.id, candidate.id)).run();

  // Picking a different candidate invalidates any previously approved/downloaded
  // image - it belonged to the old selection, not this one. The user must
  // re-approve to download the newly selected candidate's image.
  if (product.localImagePath) {
    deleteStoredImage(resolveStoragePath(product.localImagePath));
  }

  const status = classifyConfidence(candidate.confidence);
  db.update(products)
    .set({
      status,
      confidence: candidate.confidence,
      imageUrl: candidate.imageUrl,
      sourceUrl: candidate.url,
      sourceName: candidate.domain,
      verificationNotes: candidate.evidence,
      localImagePath: null,
      filename: null,
      manuallyUploaded: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(products.id, product.id))
    .run();

  const updated = db.select().from(products).where(eq(products.id, product.id)).get();
  res.json({ product: updated });
});

// APPROVE - downloads the chosen image to disk and locks it in
productsRouter.post("/:id/approve", async (req, res) => {
  const product = getProductOr404(req, res);
  if (!product) return;
  if (!product.imageUrl) {
    return res.status(400).json({ error: "No image selected for this product yet." });
  }

  try {
    const stored = await downloadAndStoreImage({
      jobId: product.jobId,
      category: product.category,
      styleCode: product.styleCode,
      colour: product.colour,
      sourceUrl: product.imageUrl,
    });

    db.insert(images)
      .values({
        id: newId("img"),
        productId: product.id,
        sourceUrl: product.imageUrl,
        localPath: stored.relativePath,
        width: stored.width,
        height: stored.height,
        verified: true,
        chosen: true,
      })
      .run();

    db.update(products)
      .set({
        status: "approved",
        localImagePath: stored.relativePath,
        filename: stored.relativePath.split(/[\\/]/).pop(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, product.id))
      .run();

    const updated = db.select().from(products).where(eq(products.id, product.id)).get();
    res.json({ product: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to download image." });
  }
});

productsRouter.post("/:id/reject", (req, res) => {
  const product = getProductOr404(req, res);
  if (!product) return;
  db.update(products)
    .set({ status: "rejected", updatedAt: new Date().toISOString() })
    .where(eq(products.id, product.id))
    .run();
  const updated = db.select().from(products).where(eq(products.id, product.id)).get();
  res.json({ product: updated });
});

// UPLOAD IMAGE / REPLACE IMAGE - manual override, always trusted since a human chose it
productsRouter.post("/:id/upload-image", uploadImage.single("file"), async (req, res) => {
  const product = getProductOr404(req, res);
  if (!product) return;
  if (!req.file) return res.status(400).json({ error: "No image file uploaded." });

  try {
    if (product.localImagePath) {
      deleteStoredImage(resolveStoragePath(product.localImagePath));
    }
    const stored = await persistImageBuffer({
      jobId: product.jobId,
      category: product.category,
      styleCode: product.styleCode,
      colour: product.colour,
      buffer: req.file.buffer,
    });

    db.insert(images)
      .values({
        id: newId("img"),
        productId: product.id,
        sourceUrl: "manual-upload",
        localPath: stored.relativePath,
        width: stored.width,
        height: stored.height,
        verified: true,
        chosen: true,
        uploadedManually: true,
      })
      .run();

    db.update(products)
      .set({
        status: "approved",
        localImagePath: stored.relativePath,
        filename: stored.relativePath.split(/[\\/]/).pop(),
        manuallyUploaded: true,
        sourceUrl: null,
        sourceName: "Manually uploaded",
        confidence: 100,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, product.id))
      .run();

    const updated = db.select().from(products).where(eq(products.id, product.id)).get();
    res.json({ product: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to save uploaded image." });
  }
});
