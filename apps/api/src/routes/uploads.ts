import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { uploads } from '@productmap/db/schema';
import { db } from '../db';

const ALLOWED_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  // image/svg+xml deliberately excluded: SVG can embed scripts and is served
  // same-origin from /uploads/* — stored XSS vector.
};
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Storage: <repo>/uploads/<nanoid>.<ext>. node:fs/path are loaded lazily inside
// the POST handler so importing the Hono `app` graph stays browser-safe. The
// uploads dir is ensured at boot by the node entry (index.ts).

export const uploadsRoutes = new Hono()
  // POST /api/uploads — multipart {file, documentId?} → 201 { id, url }
  .post('/', async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      return c.json({ error: 'validation', issues: [{ message: 'file field is required' }] }, 400);
    }
    const ext = ALLOWED_MIME[file.type];
    if (!ext) {
      return c.json(
        { error: 'validation', issues: [{ message: `unsupported mime type: ${file.type}` }] },
        400,
      );
    }
    if (file.size > MAX_BYTES) {
      return c.json({ error: 'too_large', maxBytes: MAX_BYTES }, 413);
    }

    const { mkdirSync } = await import('node:fs');
    const { writeFile } = await import('node:fs/promises');
    const path = (await import('node:path')).default;
    const { fileURLToPath } = await import('node:url');

    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const uploadsDir = path.join(repoRoot, 'uploads');
    mkdirSync(uploadsDir, { recursive: true });

    const storedName = `${nanoid()}.${ext}`;
    await writeFile(path.join(uploadsDir, storedName), Buffer.from(await file.arrayBuffer()));

    const documentId =
      typeof body.documentId === 'string' && UUID_RE.test(body.documentId)
        ? body.documentId
        : null;

    const [row] = await db
      .insert(uploads)
      .values({
        documentId,
        filename: file.name,
        mime: file.type,
        path: `uploads/${storedName}`,
      })
      .returning({ id: uploads.id });

    return c.json({ id: row.id, url: `/uploads/${storedName}` }, 201);
  });
