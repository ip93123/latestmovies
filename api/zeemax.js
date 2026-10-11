// ZeeMax Player Stream Engine (Formerly Max Player)
// Routes to HLS adaptive engine
import hlsHandler from './hls.js';

export default async function handler(req, res) {
  return hlsHandler(req, res);
}
