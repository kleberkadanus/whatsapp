// crypto-fix.js - Resolve problemas com o módulo de criptografia no Baileys

/**
 * Aplica a correção para problemas de criptografia no Baileys
 */
function applyCryptoFix() {
    try {
      const crypto = require('crypto');
      
      // Verificar se a função getRandomValues já existe
      if (crypto.getRandomValues === undefined) {
        // Implementar getRandomValues usando randomBytes
        crypto.getRandomValues = (array) => {
          const bytes = crypto.randomBytes(array.length);
          for (let i = 0; i < bytes.length; i++) {
            array[i] = bytes[i];
          }
          return array;
        };
        
        console.log('Correção de criptografia aplicada com sucesso');
      } else {
        console.log('Função getRandomValues já existe, correção não necessária');
      }
    } catch (error) {
      console.error('Erro ao aplicar correção de criptografia:', error);
    }
  }
  
  module.exports = {
    applyCryptoFix
  };