import crypto from 'crypto';

// Cloudflare R2 S3-Compatible Helper
// Zero-dependency pure Node.js AWS SigV4 implementation for R2 presigned URLs

export function getR2Config() {
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = (process.env.R2_BUCKET_NAME || 'hackymax').trim();
  const publicDomain = (process.env.R2_PUBLIC_DOMAIN || '').trim(); // e.g. https://pub-xxx.r2.dev or custom cdn

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicDomain,
    isConfigured: Boolean(accountId && accessKeyId && secretAccessKey)
  };
}

function hmac(key, string, encoding) {
  return crypto.createHmac('sha256', key).update(string, 'utf8').digest(encoding);
}

function hash(string) {
  return crypto.createHash('sha256').update(string, 'utf8').digest('hex');
}

// Generates an AWS Signature Version 4 presigned PUT URL for Cloudflare R2 direct client upload
export function createPresignedPutUrl({ key, contentType = 'text/plain; charset=utf-8', expiresIn = 900 }) {
  const config = getR2Config();
  if (!config.isConfigured) {
    throw new Error('Cloudflare R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) are not set.');
  }

  const endpointHost = `${config.bucket}.${config.accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8); // YYYYMMDD

  const cleanKey = key.replace(/^\/+/, '');
  const canonicalUri = `/${encodeURI(cleanKey)}`;

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const queryParams = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host'
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `host:${endpointHost}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hash(canonicalRequest)
  ].join('\n');

  // Derive signing key
  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign, 'hex');

  return `https://${endpointHost}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// Generates an AWS Signature Version 4 presigned GET URL for Cloudflare R2 object download
export function createPresignedGetUrl({ key, expiresIn = 86400 }) {
  const config = getR2Config();
  if (!config.isConfigured) return null;

  if (config.publicDomain) {
    const cleanKey = key.replace(/^\/+/, '');
    return `${config.publicDomain.replace(/\/$/, '')}/${cleanKey}`;
  }

  const endpointHost = `${config.bucket}.${config.accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const cleanKey = key.replace(/^\/+/, '');
  const canonicalUri = `/${encodeURI(cleanKey)}`;
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const queryParams = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host'
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `host:${endpointHost}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hash(canonicalRequest)
  ].join('\n');

  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign, 'hex');

  return `https://${endpointHost}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// Directly uploads an object (string or Buffer) to R2 from server-side
export async function putR2Object({ key, body, contentType = 'application/json' }) {
  const config = getR2Config();
  if (!config.isConfigured) return false;
  try {
    const putUrl = createPresignedPutUrl({ key, contentType, expiresIn: 300 });
    const res = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[r2-helper] putR2Object rejected for ${key}: HTTP ${res.status} - ${errText}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[r2-helper] putR2Object error for ${key}:`, err.message);
    return false;
  }
}

// Directly downloads an object text from R2 from server-side
export async function getR2ObjectText(key) {
  const config = getR2Config();
  if (!config.isConfigured) return null;
  try {
    const getUrl = createPresignedGetUrl({ key, expiresIn: 300 });
    if (!getUrl) return null;
    const res = await fetch(getUrl, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.warn(`[r2-helper] getR2ObjectText failed for ${key}:`, err.message);
    return null;
  }
}

// Generates an AWS Signature Version 4 presigned DELETE URL for Cloudflare R2 object deletion
export function createPresignedDeleteUrl({ key, expiresIn = 300 }) {
  const config = getR2Config();
  if (!config.isConfigured) {
    throw new Error('Cloudflare R2 credentials are not set.');
  }

  const endpointHost = `${config.bucket}.${config.accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const cleanKey = key.replace(/^\/+/, '');
  const canonicalUri = `/${encodeURI(cleanKey)}`;
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const queryParams = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host'
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `host:${endpointHost}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'DELETE',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hash(canonicalRequest)
  ].join('\n');

  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign, 'hex');

  return `https://${endpointHost}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// Directly deletes an object from R2 from server-side
export async function deleteR2Object({ key }) {
  const config = getR2Config();
  if (!config.isConfigured) return false;
  try {
    const deleteUrl = createPresignedDeleteUrl({ key, expiresIn: 300 });
    const res = await fetch(deleteUrl, { method: 'DELETE' });
    if (!res.ok && res.status !== 204 && res.status !== 404) {
      console.error(`[r2-helper] deleteR2Object rejected for ${key}: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[r2-helper] deleteR2Object error for ${key}:`, err.message);
    return false;
  }
}

