// SinMax — alias of HackyMax (identical engine, kept for backwards compatibility)
import hackyMaxHandler from './hackymax.js';

export default async function handler(req, res) {
  return hackyMaxHandler(req, res);
}
