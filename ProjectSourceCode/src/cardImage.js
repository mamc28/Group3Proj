const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Accept raster images only. Do not trust the filename or browser MIME type.
function parseCardImage(value) {
  if (typeof value !== 'string') throw new Error('Choose a PNG, JPEG, or WebP image up to 2 MB.');
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
    throw new Error('Choose a PNG, JPEG, or WebP image up to 2 MB.');
  }
  const data = Buffer.from(match[2], 'base64');
  const type = match[1];
  const valid = type === 'image/png' ? data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) :
    type === 'image/jpeg' ? data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff :
    data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  if (!valid || data.length > MAX_IMAGE_BYTES || data.toString('base64') !== match[2]) {
    throw new Error('Choose a valid PNG, JPEG, or WebP image up to 2 MB.');
  }
  return { data, type };
}
module.exports = { parseCardImage };


/*
Validates uploaded images on the server. It checks the allowed format, file signature, base64 encoding, and 2 MB size limit,
then converts the image into bytes for database storage. Rejects SVG, HTML, and unsupported formats to protect against XSS
*/
