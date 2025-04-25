// Arquivo: crypto-fix.js
// Este arquivo corrige o erro "crypto is not defined" no Baileys

// Importa o módulo crypto e o adiciona ao escopo global
const crypto = require('crypto');
global.crypto = crypto;

// Adiciona as funções específicas que o Baileys precisa
// baseado no erro que está ocorrendo
if (!global.crypto.subtle) {
  global.crypto.subtle = {
    digest: async (algorithm, data) => {
      return Promise.resolve(
        algorithm === 'sha-256'
          ? crypto.createHash('sha256').update(Buffer.from(data)).digest()
          : crypto.createHash('sha-1').update(Buffer.from(data)).digest()
      );
    }
  };
}

module.exports = {
  applyCryptoFix: () => {
    console.log('Correção do crypto aplicada com sucesso');
  }
};