const crypto = require('crypto');

/**
 * Generates a 32-character hexadecimal cryptographic public token for quotes (CommonJS)
 */
function generatePublicToken() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = {
  generatePublicToken: generatePublicToken,
};
