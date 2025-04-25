/**
 * database.config.js - Configurações de conexão com o banco de dados
 * 
 * Este arquivo contém as configurações necessárias para a conexão
 * com o banco de dados MySQL, incluindo host, usuário, senha e nome do banco.
 */

// Usar variáveis de ambiente para dados sensíveis ou configurações específicas
// do ambiente, com valores padrão para desenvolvimento
const config = {
    // Host do banco de dados
    host: process.env.DB_HOST || 'localhost',
    
    // Porta do banco de dados
    port: process.env.DB_PORT || 3306,
    
    // Usuário do banco de dados
    user: process.env.DB_USER || 'whatsapp_bot',
    
    // Senha do banco de dados
    password: process.env.DB_PASSWORD || 'senha_segura',
    
    // Nome do banco de dados
    database: process.env.DB_NAME || 'whatsapp_bot_db',
    
    // Configurações adicionais
    connectionLimit: process.env.DB_CONNECTION_LIMIT || 10,
    
    // Definir fuso horário para o banco de dados
    timezone: 'local',
    
    // Configurações específicas para diferentes ambientes
    development: {
      debug: true,
      multipleStatements: true
    },
    
    production: {
      debug: false,
      multipleStatements: false,
      ssl: {
        // Pode adicionar configurações de SSL para ambiente de produção
        rejectUnauthorized: true
      }
    },
    
    test: {
      debug: true,
      multipleStatements: true
    }
  };
  
  // Determinar ambiente atual
  const env = process.env.NODE_ENV || 'development';
  
  // Mesclar configurações específicas do ambiente com as configurações base
  const envConfig = config[env] || {};
  const finalConfig = { ...config, ...envConfig };
  
  // Remover as configurações específicas de ambiente que não são necessárias
  delete finalConfig.development;
  delete finalConfig.production;
  delete finalConfig.test;
  
  // Exportar configuração final
  module.exports = finalConfig;