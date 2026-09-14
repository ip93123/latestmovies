// /api/subtitles.js — Stub: Baiscope blocks server-side scraping (Cloudflare 403)
// Subtitle loading is handled client-side via file drag-and-drop / file picker instead.
export default function handler(req, res) {
  res.status(501).json({ error: 'Use client-side subtitle file loader instead' });
}
