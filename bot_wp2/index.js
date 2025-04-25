// index.js - SuportTech WhatsApp Bot (Versão Completa Atualizada)
// Implementação com todas as novas funcionalidades

require('./crypto-fix').applyCryptoFix();
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const qrcode = require('qrcode');
const cron = require('node-cron');

// Importar módulos locais
const db = require('./database');
const calendar = require('./calendar');
const menuManager = require('./menuManager');
const messageRouter = require('./messageRouter');
const { apiStartPostSaleSurvey } = require('./postSaleService');
const { checkUpcomingAppointments } = require('./reminderService');

// Configurações
const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Estado em memória
const sessions = {};      // { [jid]: { userId, state, data, withAgent, agent, sessionId, lastActivity } }
const queues = {};        // { [agent]: [jid1, jid2, ...] }
let whatsappSock;

// ### Iniciar WhatsApp ###
async function startWhatsApp() {
  // Inicializar dependências
  await db.initDatabase();
  await db.cleanUpSessions(); // Limpar todas as sessões antigas
  
  // Limpar sessões na memória também
  Object.keys(sessions).forEach(key => {
    delete sessions[key];
  });
  console.log('Memória de sessões limpa');
  
  // Carregar menus e inicializar o calendário
  await menuManager.loadMenus();
  await calendar.initCalendarAuth();

  // Configuração do Baileys
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ 
    auth: state, 
    printQRInTerminal: true,
    defaultQueryTimeoutMs: 60000
  });
  whatsappSock = sock;

  // Eventos do Baileys
  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      // Gerar QR Code para conexão
      qrcode.toFile('./public/qr.png', qr, { errorCorrectionLevel: 'H' });
      console.log('Novo QR code gerado');
    }
    
    if (connection === 'open') {
      console.log('WhatsApp conectado com sucesso');
    }
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão fechada devido a ', lastDisconnect?.error, ', reconectando: ', shouldReconnect);
      if (shouldReconnect) startWhatsApp();
    }
  });

  // Manipulação de mensagens recebidas
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe) await handleIncomingMessage(msg);
    }
  });

  // Configurar tarefas cron
  setupCronJobs();
  
  // Expor globalmente para acesso de outros módulos
  global.sessions = sessions;
  global.queues = queues;
  
  return sock;
}

// ### Handle Incoming Message ###
async function handleIncomingMessage(message) {
  const jid = message.key.remoteJid;
  
  // Ignorar mensagens de grupos e broadcasts
  if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) return;

  // Ignorar mensagens com mais de 1 minuto
  const msgTs = message.messageTimestamp || (message.key.timestamp || 0);
  const nowTs = Math.floor(Date.now() / 1000);
  if (nowTs - msgTs > 60) {
    console.log(`Mensagem antiga ignorada (timestamp ${msgTs})`);
    return;
  }
  
  // Extrair texto da mensagem
  const text = message.message?.conversation || 
               message.message?.extendedTextMessage?.text || 
               message.message?.buttonsResponseMessage?.selectedButtonId ||
               message.message?.listResponseMessage?.singleSelectReply?.selectedRowId || 
               '';
  const trimmed = text.trim();
  const phone = jid.split('@')[0];

  // Ignorar números bloqueados
  if (await db.isBlockedNumber(phone)) {
    console.log(`Mensagem ignorada de número bloqueado: ${phone}`);
    return;
  }
  
  // Obter ou criar usuário
  const user = await db.getOrCreateUser(phone);
  if (!user || !user.id) {
    console.warn(`⚠️ Falha ao obter/criar usuário para: ${phone}`);
    await sendText(jid, 'Desculpe, estamos com um problema. Tente novamente em alguns segundos.');
    return;
  }
  
  // Salvar mensagem no histórico
  await db.saveMessage(user.id, 'incoming', trimmed);
  
  // Verificar e gerenciar sessão
  let sess = sessions[jid];
  if (!sess) {
    const dbSess = await db.getActiveSession(user.id);
    
    // Se não tiver sessão, criar uma nova
    if (!dbSess || dbSess.menu === 'finished') {
      const newSession = await db.createSession(user.id, 'init');
      if (!newSession) {
        console.error(`Falha ao criar sessão para usuário: ${user.id}`);
        await sendText(jid, 'Estamos com problemas técnicos temporários. Por favor, tente novamente mais tarde.');
        return;
      }
      
      sess = { 
        userId: user.id, 
        state: 'init',
        data: {}, 
        withAgent: false, 
        agent: null, 
        sessionId: newSession.id,
        lastActivity: Date.now()
      };
    } else {
      // Determinar o estado baseado no que existe na sessão do banco
      let state = 'init';
      
      // Verificar se temos menu ou current_menu
      if (dbSess.menu) {
        state = dbSess.menu;
      } else if (dbSess.current_menu) {
        state = dbSess.current_menu;
      }
      
      sess = { 
        userId: user.id, 
        state: state,
        data: {}, 
        withAgent: Boolean(dbSess.with_agent), 
        agent: dbSess.agent_phone, 
        sessionId: dbSess.id,
        lastActivity: Date.now()
      };
    }
    
    sessions[jid] = sess;
  } else {
    sess.lastActivity = Date.now();
  }
  
  // Preparar funções de utilidade para o roteador
  const utilFuncs = {
    sendText: (to, text) => sendText(to, text),
    sendImage: (to, path, caption) => sendImage(to, path, caption),
    sendDocument: (to, path, fileName, caption) => sendDocument(to, path, fileName, caption),
    sendLocation: (to, lat, long, caption) => sendLocation(to, lat, long, caption),
    formatMenu: (menuKey) => formatMenu(menuKey)
  };
  
  // Utilizar o roteador de mensagens para processar conforme o estado
  await messageRouter.routeMessage(jid, sess, trimmed, utilFuncs);
}

// ### Funções de envio de mensagens ###
async function sendText(jid, text) {
  try {
    await whatsappSock.sendMessage(jid, { text });
    
    // Se for para um cliente, salvar no histórico de mensagens
    const phone = jid.split('@')[0];
    const user = await db.getOrCreateUser(phone).catch(() => null);
    if (user && user.id) {
      await db.saveMessage(user.id, 'outgoing', text);
    }
    return true;
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    return false;
  }
}

async function sendImage(jid, imagePath, caption = '') {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    
    await whatsappSock.sendMessage(jid, {
      image: imageBuffer,
      caption: caption
    });
    
    // Salvar no histórico se for para cliente
    const phone = jid.split('@')[0];
    const user = await db.getOrCreateUser(phone).catch(() => null);
    if (user && user.id) {
      await db.saveMessage(user.id, 'outgoing', `[IMAGEM] ${caption}`);
    }
    
    return true;
  } catch (err) {
    console.error('Erro ao enviar imagem:', err);
    return false;
  }
}

async function sendDocument(jid, docPath, fileName, caption = '') {
  try {
    const docBuffer = await fs.readFile(docPath);
    
    await whatsappSock.sendMessage(jid, {
      document: docBuffer,
      fileName: fileName,
      caption: caption,
      mimetype: getMimeType(fileName)
    });
    
    // Salvar no histórico se for para cliente
    const phone = jid.split('@')[0];
    const user = await db.getOrCreateUser(phone).catch(() => null);
    if (user && user.id) {
      await db.saveMessage(user.id, 'outgoing', `[DOCUMENTO] ${fileName} - ${caption}`);
    }
    
    return true;
  } catch (err) {
    console.error('Erro ao enviar documento:', err);
    return false;
  }
}

async function sendLocation(jid, lat, long, caption = '') {
  try {
    await whatsappSock.sendMessage(jid, {
      location: {
        degreesLatitude: lat,
        degreesLongitude: long
      },
      caption: caption
    });
    
    // Salvar no histórico se for para cliente
    const phone = jid.split('@')[0];
    const user = await db.getOrCreateUser(phone).catch(() => null);
    if (user && user.id) {
      await db.saveMessage(user.id, 'outgoing', `[LOCALIZAÇÃO] ${caption}`);
    }
    
    return true;
  } catch (err) {
    console.error('Erro ao enviar localização:', err);
    return false;
  }
}

// ### Função para formatar menus ###
function formatMenu(menuKey) {
  const menus = menuManager.getMenus();
  const m = menus[menuKey] || {};
  
  let txt = `*${m.title || 'Menu'}*\n${m.message || ''}\n\n`;
  (m.options || []).forEach(o => txt += `*${o.id}.* ${o.title}\n`);
  return txt + '\nDigite o número da opção:';
}

// ### Cron Jobs ###
function setupCronJobs() {
  // Verificar agendamentos para enviar lembretes (a cada hora)
  cron.schedule('0 * * * *', async () => {
    console.log('Executando verificação de lembretes...');
    const count = await checkUpcomingAppointments(sendText);
    console.log(`${count} lembretes enviados`);
  });

  // Verificar fila e notificar avanços (a cada minuto)
  cron.schedule('* * * * *', async () => {
    for (const [agent, queue] of Object.entries(queues)) {
      if (queue.length > 1) {
        // Notificar avanço na fila para todos após a primeira posição
        for (let i = 1; i < queue.length; i++) {
          const jid = queue[i];
          const pos = i + 1;
          const msg = await db.getCustomText('queue_position_update') || 
                    'Atualização: você agora está na posição {position} da fila.';
          await sendText(jid, msg.replace('{position}', pos));
        }
      }
    }
  });

  // Limpeza de sessões inativas (a cada 30 minutos)
  cron.schedule('*/30 * * * *', async () => {
    console.log('Executando limpeza de sessões inativas');
    const now = Date.now();
    const timeoutMs = parseInt(await db.getConfig('session_timeout_minutes') || '360') * 60 * 1000;
    
    const inactiveSessions = [];
    
    for (const [jid, sess] of Object.entries(sessions)) {
      if (!sess.lastActivity || (now - sess.lastActivity > timeoutMs)) {
        // Se cliente estiver em atendimento, não limpar
        if (sess.withAgent) continue;
        
        inactiveSessions.push(jid);
      }
    }
    
    // Remover sessões inativas
    for (const jid of inactiveSessions) {
      delete sessions[jid];
    }
    
    console.log(`${inactiveSessions.length} sessões inativas removidas`);
  });
  
  // Verificar flag de pós-venda pendente (a cada 5 minutos)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const isPending = await db.getConfig('postsale_pending') === 'true';
      if (isPending) {
        console.log('Verificando pesquisas pós-venda pendentes...');
        
        // Verificar no banco qual cliente precisa receber a pesquisa
        const [rows] = await db.pool.execute(
          'SELECT user_id, service_type FROM postsale_requests WHERE status = ? ORDER BY created_at ASC LIMIT 1',
          ['pending']
        );
        
        if (rows && rows.length > 0) {
          const { user_id, service_type } = rows[0];
          
          // Buscar o telefone do cliente
          const [userRows] = await db.pool.execute(
            'SELECT phone, name FROM users WHERE id = ? LIMIT 1',
            [user_id]
          );
          
          if (userRows && userRows.length > 0) {
            const { phone } = userRows[0];
            
            // Iniciar a pesquisa
            const postSaleService = require('./postSaleService');
            await postSaleService.startPostSaleSurvey(phone, service_type, sendText);
            
            // Atualizar o status da solicitação
            await db.pool.execute(
              'UPDATE postsale_requests SET status = ? WHERE user_id = ? AND status = ?',
              ['processing', user_id, 'pending']
            );
          }
        } else {
          // Se não houver solicitações pendentes, atualizar a flag
          await db.pool.execute(
            'UPDATE postsale_settings SET value = ? WHERE setting = ?',
            ['false', 'postsale_pending']
          );
        }
      }
    } catch (error) {
      console.error('Erro ao verificar pesquisas pós-venda:', error);
    }
  });
}

// ### Utilidades ###
function getMimeType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const mimeTypes = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    txt: 'text/plain'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

// ### API ###
// Endpoint para verificar status
app.get('/status', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json({ 
      connected: Boolean(whatsappSock), 
      sessions: Object.keys(sessions).length, 
      queues: Object.fromEntries(Object.entries(queues).map(([k,v]) => [k, v.length])),
      stats 
    });
  } catch (error) {
    console.error('Erro ao obter status:', error);
    res.status(500).json({ error: 'Erro interno ao obter status' });
  }
});

// Endpoint para obter configurações
app.get('/config', async (req, res) => {
  try {
    const config = await db.getAllConfig();
    res.json(config);
  } catch (error) {
    console.error('Erro ao obter configurações:', error);
    res.status(500).json({ error: 'Erro interno ao obter configurações' });
  }
});

// Endpoint para salvar configurações
app.post('/config', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Chave obrigatória' });
    await db.setConfig(key, value);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar configuração:', error);
    res.status(500).json({ error: 'Erro interno ao salvar configuração' });
  }
});

// Endpoint para obter menus
app.get('/menus', async (req, res) => {
  try {
    await menuManager.loadMenus();
    res.json(menuManager.getMenus());
  } catch (error) {
    console.error('Erro ao obter menus:', error);
    res.status(500).json({ error: 'Erro interno ao obter menus' });
  }
});

// Endpoint para salvar menus
app.post('/menus', async (req, res) => {
  try {
    const { key, data } = req.body;
    if (!key || !data) return res.status(400).json({ error: 'Chave e dados obrigatórios' });
    await menuManager.saveMenu(key, data);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar menu:', error);
    res.status(500).json({ error: 'Erro interno ao salvar menu' });
  }
});

// Endpoint para obter mensagens de um usuário
app.get('/messages/:phone', async (req, res) => {
  try {
    const user = await db.getOrCreateUser(req.params.phone);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const messages = await db.getMessageHistory(user.id, 50);
    res.json(messages);
  } catch (error) {
    console.error('Erro ao obter mensagens:', error);
    res.status(500).json({ error: 'Erro interno ao obter mensagens' });
  }
});

// Endpoint para buscar usuários
app.get('/users/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Parâmetro de busca obrigatório' });
    
    const user = await db.findUserByPhoneOrName(q);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    
    res.json(user);
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({ error: 'Erro interno ao buscar usuário' });
  }
});

// Endpoint para obter agendamentos
app.get('/schedules', async (req, res) => {
  try {
    const { start, end } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({ error: 'Datas de início e fim obrigatórias' });
    }
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    const schedules = await db.getSchedulingsByDateRange(startDate, endDate);
    res.json(schedules);
  } catch (error) {
    console.error('Erro ao buscar agendamentos:', error);
    res.status(500).json({ error: 'Erro interno ao buscar agendamentos' });
  }
});

// Endpoint para iniciar pesquisa pós-venda
app.post('/postsale/start', async (req, res) => {
  try {
    await apiStartPostSaleSurvey(req, res, sendText);
  } catch (error) {
    console.error('Erro ao iniciar pesquisa pós-venda:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao iniciar pesquisa pós-venda' });
  }
});

// ### Iniciar tudo ###
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
startWhatsApp().catch(console.error);

// Exportar funções e objetos úteis
module.exports = {
  sendText,
  sendImage,
  sendDocument,
  sendLocation,
  sessions,
  queues
};