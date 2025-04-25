/**
 * app.config.js - Configurações gerais da aplicação
 * 
 * Este arquivo contém todas as configurações da aplicação que podem ser
 * ajustadas sem necessidade de modificar o código-fonte.
 */

// Importar dependências
const path = require('path');

// Configuração do ambiente
const environment = process.env.NODE_ENV || 'development';

// Configurações do servidor
const server = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || 'localhost',
  corsOrigins: ['http://localhost:3000', 'https://seudominio.com']
};

// Configurações de autenticação
const auth = {
  secretKey: process.env.SECRET_KEY || 'sua_chave_secreta_para_jwt',
  tokenExpiration: '24h',
  refreshTokenExpiration: '7d',
  saltRounds: 10
};

// Configurações do WhatsApp
const whatsapp = {
  // Tempo máximo (em minutos) para considerar uma sessão ativa
  sessionTimeout: 30,
  
  // Número máximo de sessões simultâneas
  maxSessions: 5,
  
  // Tempo em segundos para esperar antes de tentar reconectar automaticamente
  reconnectInterval: 10,
  
  // Mensagem padrão quando o menu não é encontrado
  defaultNotFoundMessage: 'Opção não encontrada. Por favor, escolha uma opção válida.',
  
  // Mensagem de boas-vindas
  welcomeMessage: 'Olá! Seja bem-vindo ao nosso atendimento. Como posso ajudar?',
  
  // Prefixo para comandos administrativos
  adminCommandPrefix: '!admin',
  
  // Diretório para armazenar dados de autenticação do WhatsApp
  authDir: path.join(__dirname, '../auth_info'),
  
  // Tempo máximo (em segundos) para esperar resposta do usuário
  replyTimeout: 300,
  
  // Mensagem quando o tempo de resposta expira
  timeoutMessage: 'Não recebemos sua resposta. Se precisar de ajuda, inicie uma nova conversa.'
};

// Configurações de arquivos e uploads
const files = {
  uploadsDir: path.join(__dirname, '../uploads'),
  tempDir: path.join(__dirname, '../temp'),
  invoicesDir: path.join(__dirname, '../invoices'),
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'text/csv'
  ]
};

// Configurações de logs
const logs = {
  dir: path.join(__dirname, '../logs'),
  level: environment === 'production' ? 'info' : 'debug',
  maxSize: '10m',
  maxFiles: 5
};

// Configurações de agendamento
const scheduling = {
  // Horário de funcionamento (para agendamentos)
  businessHours: {
    start: '08:00',
    end: '18:00',
    daysOff: [0, 6] // Domingo e Sábado (0 = Domingo, 6 = Sábado)
  },
  
  // Duração padrão das visitas (em minutos)
  defaultVisitDuration: 60,
  
  // Intervalo mínimo entre agendamentos (em minutos)
  minInterval: 30,
  
  // Tempo mínimo de antecedência para agendamento (em horas)
  minAdvanceTime: 24
};

// Configurações de pós-venda
const postsale = {
  // Tempo de espera (em dias) após a conclusão do serviço
  waitDays: 1,
  
  // Número máximo de tentativas para coletar feedback
  maxAttempts: 3,
  
  // Intervalo (em horas) entre tentativas
  retryInterval: 24,
  
  // Tipos de serviço para pesquisa pós-venda
  serviceTypes: [
    'Instalação',
    'Manutenção',
    'Suporte',
    'Visita Técnica',
    'Configuração',
    'Outro'
  ]
};

// Configurações de notificações
const notifications = {
  // Tempo (em minutos) antes do agendamento para enviar lembrete
  reminderBeforeMinutes: 60,
  
  // Tipos de notificações ativas
  types: {
    appointmentReminder: true,
    invoiceDue: true,
    invoicePaid: true,
    appointmentCreated: true,
    appointmentCancelled: true,
    postSaleSurvey: true
  }
};

// Exportar configurações
module.exports = {
  environment,
  server,
  auth,
  whatsapp,
  files,
  logs,
  scheduling,
  postsale,
  notifications
};
