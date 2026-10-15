import crypto from 'crypto';

// Cloudflare R2 S3-Compatible Helper
// Zero-dependency pure Node.js AWS SigV4 implementation for R2 presigned URLs

export function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
  const bucket = process.env.R2_BUCKET_NAME || 'hackymax-subtitles';
  const publicDomain = process.env.R2_PUBLIC_DOMAIN || ''; // e.g. https://pub-xxx.r2.dev or custom cdn

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
    'X-Amz-SignedHeaders': 'content-type;host'
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `content-type:${contentType.trim()}\nhost:${endpointHost}\n`;
  const signedHeaders = 'content-type;host';
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
