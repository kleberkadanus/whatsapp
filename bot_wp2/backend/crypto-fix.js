// crypto-fix.js - Resolve problemas com o módulo de criptografia no Baileys

/**
 * Aplica a correção para problemas de criptografia no Baileys
 */
const nodeCrypto = require('crypto');
global.crypto = nodeCrypto;

// minimal polyfill do subtle.digest que o Baileys usa
if (!global.crypto.subtle) {
  global.crypto.subtle = {
    digest: async (alg, data) => {
      const hash = alg === 'sha-256'
        ? nodeCrypto.createHash('sha256')
        : nodeCrypto.createHash('sha1');
      hash.update(Buffer.from(data));
      return hash.digest();
    }
  };
}

module.exports = {
  applyCryptoFix: () => console.log('✅ Crypto global aplicado com sucesso')
};