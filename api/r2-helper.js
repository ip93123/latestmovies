import crypto from 'crypto';

// Cloudflare R2 / AWS S3 SigV4 Presigned URL Generator (Zero-dependency)
export function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
  const bucket = process.env.R2_BUCKET_NAME || 'hackymax-subtitles';
  const publicDomain = process.env.R2_PUBLIC_DOMAIN || ''; // e.g. "https://subtitles.hackystreaming.online"

  const isConfigured = Boolean(accountId && accessKeyId && secretAccessKey);
  return { accountId, accessKeyId, secretAccessKey, bucket, publicDomain, isConfigured };
}

// Generate S3 SigV4 Presigned PUT URL for direct browser uploads up to 20MB+
export function createPresignedPutUrl({
  key,
  contentType = 'text/plain',
  expiresIn = 900 // 15 mins
}) {
  const { accountId, accessKeyId, secretAccessKey, bucket } = getR2Config();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  const region = 'auto';
  const service = 's3';
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const endpoint = `https://${host}`;

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = dateStr.slice(0, 8); // YYYYMMDD
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const canonicalUri = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const queryParams = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': dateStr,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host'
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
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
    dateStr,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');

  function getSignatureKey(key, dateStamp, regionName, serviceName) {
    const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    return kSigning;
  }

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const presignedUrl = `${endpoint}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return presignedUrl;
}
