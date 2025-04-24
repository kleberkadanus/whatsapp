// agentRouter.js - Módulo para gerenciar encaminhamento para agentes especialistas
const db = require('./database');

/**
 * Encaminha o cliente para o atendente adequado
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão do cliente
 * @param {Object} opt - Opção selecionada no menu
 * @param {String} contextMessage - Mensagem adicional de contexto
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function forwardToAgent(jid, sess, opt, contextMessage = '', sendText) {
  try {
    const phone = jid.split('@')[0];
    const configKey = opt.config_key || 'commercial_agent';
    
    // Obter telefone do agente (da opção diretamente ou da configuração)
    let agentPhone = opt.agent_phone || await db.getConfig(configKey) || '';
    
    // Remover caracteres não numéricos
    agentPhone = agentPhone.toString().replace(/\D/g, '');
    
    if (!agentPhone) {
      await sendText(jid, await db.getCustomText('agent_not_found') || 'Desculpe, não foi possível localizar um atendente disponível.');
      sess.state = 'menu_main';
      await sendText(jid, formatMenu('main'));
      return;
    }
  
    // Verificar horário de atendimento
    const businessHours = await isBusinessHours();
    if (!businessHours) {
      const offHoursMsg = await db.getCustomText('off_hours_message') || 
                        'Nosso horário de atendimento é de segunda a sexta, das 9h às 12h e das 13h às 17h. Seu contato foi registrado e retornaremos assim que possível.';
      await sendText(jid, offHoursMsg);
      
      // Registrar no sistema para retorno posterior
      await db.saveScheduling(sess.userId, {
        serviceType: 'retorno',
        serviceOption: 'fora_horario',
        description: contextMessage || 'Cliente tentou contato fora do horário de atendimento',
        appointmentDate: new Date(), // Data atual
        status: 'pending'
      });
      
      sess.state = 'menu_main';
      return;
    }
  
    // Colocar na fila
    const queues = global.queues || {};
    queues[agentPhone] = queues[agentPhone] || [];
    const pos = enqueue(agentPhone, jid, queues);
    
    if (pos === 1) {
      // iniciar chat
      sess.withAgent = true; 
      sess.agent = agentPhone; 
      sess.state = 'chat';
      
      await sendText(jid, await db.getCustomText('forwarding') || 'Transferindo para o atendente...');
      
      // Enviar mensagem para o agente com contexto (se houver)
      let notification = `🔔 Novo atendimento de ${phone}`;
      if (contextMessage) {
        notification += `\n${contextMessage}`;
      }
      
      // Obter detalhes do usuário para informar o agente
      const user = await db.getOrCreateUser(phone);
      if (user) {
        notification += `\n\nDados do cliente:`;
        notification += `\nNome: ${user.name || 'Não informado'}`;
        notification += `\nE-mail: ${user.email || 'Não informado'}`;
        notification += `\nEndereço: ${user.address || 'Não informado'}`;
      }
      
      await sendText(`${agentPhone}@s.whatsapp.net`, notification);
      await db.updateSession(sess.sessionId, { withAgent: true, agentPhone });
    } else {
      const queueMsg = await db.getCustomText('queue_position') || 'Você está na posição {position} da fila. Aguarde, por favor.';
      await sendText(jid, queueMsg.replace('{position}', pos));
    }
  } catch (error) {
    console.error('Erro ao encaminhar para agente:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao encaminhar para um atendente. Por favor, tente novamente em alguns instantes.');
    sess.state = 'menu_main';
    await sendText(jid, formatMenu('main'));
  }
}

/**
 * Processa mensagens durante atendimento com agente
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão do cliente
 * @param {String} text - Texto da mensagem
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<boolean>} - Retorna true se a mensagem foi processada como comando especial
 */
async function handleAgentChat(jid, sess, text, sendText) {
  try {
    const phone = jid.split('@')[0];
  
    // Comando /finalizar
    if (text.toLowerCase().startsWith('/finalizar')) {
      // Verificar se é o agente quem está finalizando
      const isAgent = sess.agent === phone;
      
      if (isAgent) {
        // Encontrar o cliente em atendimento
        let clientJid = null;
        const sessions = global.sessions || {};
        
        for (const [cJid, cSess] of Object.entries(sessions)) {
          if (cSess.agent === phone && cSess.withAgent && cJid !== jid) {
            clientJid = cJid;
            break;
          }
        }
        
        if (clientJid) {
          const clientSess = sessions[clientJid];
          
          // Finalizar atendimento do cliente atual
          await sendText(clientJid, await db.getCustomText('service_ended') || 'Atendimento finalizado. Obrigado por escolher nossos serviços!');
          
          // Solicitar avaliação
          await requestRating(clientJid, clientSess, sendText);
          
          // Remover da fila
          const queues = global.queues || {};
          const finished = dequeue(sess.agent, queues);
          
          // Próximo da fila
          const next = queues[sess.agent]?.[0];
          if (next) {
            await sendText(next, await db.getCustomText('service_starting') || 'Seu atendimento está começando agora.');
            const nextSess = sessions[next];
            if (nextSess) {
              nextSess.withAgent = true;
              nextSess.state = 'chat';
              await db.updateSession(nextSess.sessionId, { withAgent: true });
            }
          }
          
          await sendText(jid, '✅ Atendimento finalizado com sucesso.');
        } else {
          await sendText(jid, '⚠️ Não há cliente em atendimento para finalizar.');
        }
      } else {
        await sendText(jid, '⚠️ Apenas o atendente pode finalizar o atendimento.');
      }
      return true; // Comando processado
    }
    
    // Comando /falarcom_telefone
    if (text.toLowerCase().startsWith('/falarcom_') && jid.endsWith('@s.whatsapp.net')) {
      const senderJid = jid;
      const agentPhone = senderJid.split('@')[0];
      const target = text.slice(10).trim(); // Remove '/falarcom_'
      const found = await db.findUserByPhoneOrName(target);
      
      if (!found) {
        await sendText(senderJid, '❌ Cliente não encontrado.');
        return true; // Comando processado
      }
      
      const clientJid = `${found.phone}@s.whatsapp.net`;
      
      // Cria ou pega sessão direta
      const dbSess = await db.getActiveSession(found.id) || await db.createSession(found.id);
      
      const sessions = global.sessions || {};
      sessions[clientJid] = {
        userId: found.id,
        state: 'chat',
        data: {},
        withAgent: true,
        agent: agentPhone,
        sessionId: dbSess.id,
        lastActivity: Date.now()
      };
      
      await db.updateSession(dbSess.id, { withAgent: true, agentPhone });
      
      // Notifica agente e cliente
      await sendText(senderJid, `🔄 Iniciando contato com ${found.name || found.phone}...`);
      await sendText(clientJid, `🔔 O atendente iniciou um contato com você. Em que podemos ajudar?`);
      
      return true; // Comando processado
    }
  
    // Se não é um comando especial, mas está em atendimento, repassar mensagem
    if (sess.withAgent) {
      if (sess.agent) {
        await sendText(`${sess.agent}@s.whatsapp.net`, `${phone}: ${text}`);
      } else {
        // Cliente em atendimento, mas sem agente definido (caso raro)
        const configKey = 'commercial_agent';
        const agentPhone = (await db.getConfig(configKey) || '').replace(/\D/g, '');
        
        if (agentPhone) {
          sess.agent = agentPhone;
          await sendText(`${agentPhone}@s.whatsapp.net`, `${phone}: ${text}`);
          await db.updateSession(sess.sessionId, { agentPhone });
        }
      }
      return true; // Mensagem repassada
    }
  
  } catch (error) {
    console.error('Erro ao processar chat com agente:', error);
    return false; // Não processado, tentar outro handler
  }
  
  return false; // Não processado, tentar outro handler
}

/**
 * Adiciona cliente à fila de um agente
 * @param {String} agent - Telefone do agente
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} queues - Objeto de filas
 * @returns {Number} - Posição na fila
 */
function enqueue(agent, jid, queues) {
  queues[agent] = queues[agent] || [];
  queues[agent].push(jid);
  return queues[agent].length;
}

/**
 * Remove o próximo cliente da fila
 * @param {String} agent - Telefone do agente
 * @param {Object} queues - Objeto de filas
 * @returns {String|null} - JID do cliente removido ou null
 */
function dequeue(agent, queues) {
  return (queues[agent] || []).shift() || null;
}

/**
 * Verifica se está no horário de atendimento
 * @returns {Promise<boolean>}
 */
async function isBusinessHours() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = now.getHours();
  
  // Verificar se é final de semana
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  // Buscar configurações de horário do banco
  const startMorning = parseInt(await db.getConfig('business_hours_start_morning') || '9');
  const endMorning = parseInt(await db.getConfig('business_hours_end_morning') || '12');
  const startAfternoon = parseInt(await db.getConfig('business_hours_start_afternoon') || '13');
  const endAfternoon = parseInt(await db.getConfig('business_hours_end_afternoon') || '17');
  
  // Verificar se está dentro do horário comercial
  return (hour >= startMorning && hour < endMorning) || 
         (hour >= startAfternoon && hour < endAfternoon);
}

// Exportar funções
module.exports = {
  forwardToAgent,
  handleAgentChat,
  isBusinessHours,
  enqueue,
  dequeue
};