import crypto from 'crypto';

// Subtitle Studio Contributor Authentication
// Generates and verifies HMAC-SHA256 session tokens

const JWT_SECRET = process.env.SUB_AUTH_SECRET || process.env.API_SECRET || 'hackymax_sub_secret_key_2026';

// Parse contributors from environment or use default setup
function getContributors() {
  const envContributors = process.env.SUB_CONTRIBUTORS;
  const map = {
    'admin': 'hackymax2026',
    'contributor': 'subtitles123'
  };

  if (envContributors) {
    try {
      // Try JSON format
      if (envContributors.trim().startsWith('{')) {
        return { ...map, ...JSON.parse(envContributors) };
      }
      // Try "user:pass,user2:pass2" format
      envContributors.split(',').forEach(pair => {
        const [u, p] = pair.split(':');
        if (u && p) map[u.trim()] = p.trim();
      });
    } catch (e) {
      console.error('[sub-auth] Error parsing SUB_CONTRIBUTORS:', e);
    }
  }

  return map;
}

// Generate signed token
export function signToken(username, role = 'contributor') {
  const payload = {
    u: username,
    r: role,
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14 // 14 days valid
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

// Verify signed token
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null; // expired
    return payload;
  } catch (_) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    // Token verification endpoint
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '') || req.query.token;
    const verified = verifyToken(token);
    if (!verified) {
      return res.status(401).json({ authenticated: false, error: 'Invalid or expired session' });
    }
    return res.status(200).json({ authenticated: true, user: verified.u, role: verified.r });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action = 'login', username, password, token } = req.body || {};

  if (action === 'verify') {
    const verified = verifyToken(token);
    if (!verified) {
      return res.status(401).json({ authenticated: false, error: 'Session expired' });
    }
    return res.status(200).json({ authenticated: true, user: verified.u, role: verified.r });
  }

  if (action === 'login') {
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const contributors = getContributors();
    const cleanUser = String(username).trim();
    const cleanPass = String(password).trim();

    if (contributors[cleanUser] && contributors[cleanUser] === cleanPass) {
      const role = cleanUser === 'admin' ? 'admin' : 'contributor';
      const sessionToken = signToken(cleanUser, role);
      return res.status(200).json({
        success: true,
        user: cleanUser,
        role,
        token: sessionToken
      });
    }

    return res.status(401).json({ error: 'Invalid username or password' });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
