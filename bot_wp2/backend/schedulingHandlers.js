// schedulingHandlers.js - Módulo para gerenciar agendamentos de visitas técnicas
const db = require('./database');
const calendar = require('./calendar');

/**
 * Função para iniciar o processo de agendamento de visita técnica
 * @param {Object} jid - ID do WhatsApp do usuário
 * @param {Object} sess - Objeto de sessão
 * @returns {Promise<void>}
 */
async function startScheduling(jid, sess) {
  try {
    console.log(`Iniciando agendamento para ${jid}`);
    // Obter usuário
    const user = await db.getOrCreateUser(jid.split('@')[0]);
    
    // Verificar se temos os dados necessários
    if (!user.address || !user.email) {
      // Informar cliente que precisa completar cadastro
      await sendText(jid, await db.getCustomText('incomplete_profile') || 'Precisamos completar seu cadastro para agendar uma visita.');
      
      if (!user.address) {
        await sendText(jid, await db.getCustomText('ask_address') || 'Por favor, informe seu endereço completo:');
        sess.state = 'await_address';
        sess.data.returnState = 'scheduling';
        return;
      }
      
      if (!user.email) {
        await sendText(jid, await db.getCustomText('ask_email') || 'Por favor, informe seu e-mail:');
        sess.state = 'await_email';
        sess.data.returnState = 'scheduling';
        return;
      }
    }
    
    // Mensagem de boas-vindas do agendamento
    await sendText(jid, await db.getCustomText('scheduling_welcome') || 'Bem-vindo ao nosso sistema de agendamento de visitas técnicas. Vamos ajudá-lo a marcar o melhor horário para você!');
    
    // Enviar menu de serviços para agendamento
    if (menus['schedule']) {
      await sendText(jid, formatMenu('schedule'));
      sess.state = 'schedule_service';
    } else {
      // Se não tiver menu específico, pedir descrição diretamente
      await sendText(jid, await db.getCustomText('scheduling_description') || 'Por favor, descreva brevemente o problema ou serviço que precisa:');
      sess.state = 'schedule_desc';
    }
    
    // Atualizar sessão no banco
    await db.updateSession(sess.sessionId, { 
      menu: sess.state, 
      current_menu: sess.state 
    });
    
    console.log(`Agendamento iniciado, estado atual: ${sess.state}`);
  } catch (error) {
    console.error('Erro ao iniciar agendamento:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao iniciar o agendamento. Por favor, tente novamente mais tarde.');
    sess.state = 'menu_main';
    await sendText(jid, formatMenu('main'));
  }
}

/**
 * Processa a escolha do serviço para agendamento
 * @param {Object} jid - ID do WhatsApp do usuário
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto da mensagem recebida
 * @returns {Promise<void>}
 */
async function handleScheduleService(jid, sess, text) {
  try {
    console.log(`Processando escolha do serviço: ${text}`);
    
    const idx = parseInt(text);
    if (isNaN(idx)) {
      await sendText(jid, await db.getCustomText('invalid_option') || 'Opção inválida. Por favor, selecione novamente.');
      await sendText(jid, formatMenu('schedule'));
      return;
    }
    
    // Buscar a opção selecionada
    const menu = menus['schedule'];
    const opt = menu.options.find(o => o.id === idx);
    
    if (!opt) {
      await sendText(jid, await db.getCustomText('invalid_option') || 'Opção inválida. Por favor, selecione novamente.');
      await sendText(jid, formatMenu('schedule'));
      return;
    }
    
    // Voltar para o menu principal se selecionou opção 0
    if (idx === 0 && opt.next_menu === 'main') {
      sess.state = 'menu_main';
      await sendText(jid, formatMenu('main'));
      return;
    }
    
    // Salvar o tipo de serviço selecionado
    sess.data.serviceType = opt.title;
    console.log(`Serviço selecionado: ${sess.data.serviceType}`);
    
    // Pedir descrição do problema
    await sendText(jid, await db.getCustomText('schedule_desc') || 'Por favor, descreva brevemente o problema ou serviço que precisa:');
    sess.state = 'schedule_desc';
    
    // Atualizar sessão
    await db.updateSession(sess.sessionId, { 
      menu: sess.state, 
      current_menu: sess.state 
    });
  } catch (error) {
    console.error('Erro ao processar escolha do serviço:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao processar sua escolha. Por favor, tente novamente.');
    await sendText(jid, formatMenu('schedule'));
  }
}

/**
 * Processa a descrição do agendamento
 * @param {Object} jid - ID do WhatsApp do usuário
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto da mensagem recebida
 * @returns {Promise<void>}
 */
async function handleScheduleDescription(jid, sess, text) {
  try {
    console.log(`Recebida descrição do agendamento: ${text}`);
    
    // Salvar descrição
    sess.data.description = text;
    
    // Informar que estamos verificando disponibilidade
    await sendText(jid, await db.getCustomText('checking_availability') || 'Estou verificando nossa agenda com os horários disponíveis para você.');
    
    // Se não houver tipo de serviço definido, usar padrão
    if (!sess.data.serviceType) {
      sess.data.serviceType = 'Visita Técnica';
    }
    
    console.log(`Buscando slots disponíveis para: ${sess.data.serviceType}`);
    
    // Buscar slots disponíveis
    let slots = [];
    try {
      slots = await calendar.getAvailableSlots(sess.data.serviceType);
      console.log(`${slots.length} slots encontrados`);
    } catch (error) {
      console.error('Erro ao buscar slots:', error);
    }
    
    // Se não houver slots disponíveis
    if (!slots || slots.length === 0) {
      const msg = await db.getCustomText('no_slots_available') || 'Não encontramos horários disponíveis para os próximos dias.';
      await sendText(jid, msg);
      
      // Encaminhar para atendente
      const agentConfig = { 
        agent_phone: await db.getConfig('scheduling_agent'), 
        handler: 'forward' 
      };
      
      await forwardToAgent(jid, sess, agentConfig, 'Cliente tentou agendar mas não há slots disponíveis');
      return;
    }
    
    // Formatar mensagem com slots disponíveis
    let optMsg = await db.getCustomText('available_slots_header') || 'Temos os seguintes horários disponíveis para sua visita técnica:\n\n';
    
    slots.forEach((s, i) => {
      const d = new Date(s.start);
      const formattedDate = d.toLocaleDateString('pt-BR');
      const formattedTime = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      optMsg += `*${i+1}.* ${formattedDate} às ${formattedTime}\n`;
    });
    
    optMsg += '\nDigite o número da opção desejada:';
    
    // Enviar opções e atualizar estado
    await sendText(jid, optMsg);
    sess.data.slots = slots;
    sess.state = 'schedule_date';
    
    // Atualizar sessão
    await db.updateSession(sess.sessionId, { 
      menu: sess.state, 
      current_menu: sess.state 
    });
    
    console.log('Enviadas opções de data, aguardando escolha');
  } catch (error) {
    console.error('Erro ao processar descrição do agendamento:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao processar seu agendamento. Por favor, tente novamente mais tarde.');
    sess.state = 'menu_main';
    await sendText(jid, formatMenu('main'));
  }
}

/**
 * Processa a seleção de data
 * @param {Object} jid - ID do WhatsApp do usuário
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto da mensagem recebida
 * @returns {Promise<void>}
 */
async function handleDateSelection(jid, sess, text) {
  try {
    console.log(`Recebida seleção de data: ${text}`);
    
    const idx = parseInt(text) - 1;
    if (isNaN(idx) || idx < 0 || idx >= (sess.data.slots || []).length) {
      await sendText(jid, await db.getCustomText('invalid_option') || 'Opção inválida. Por favor, selecione novamente.');
      return;
    }
    
    // Salvar slot selecionado
    sess.data.selected = sess.data.slots[idx];
    console.log(`Slot selecionado: ${sess.data.selected.start}`);
    
    // Preparar mensagem de confirmação
    const price = await db.getServicePrice(sess.data.serviceType) || await db.getConfig('visit_price') || '150,00';
    const d = new Date(sess.data.selected.start);
    const formattedDate = d.toLocaleDateString('pt-BR');
    const formattedTime = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    let confirmMsg = await db.getCustomText('confirm_appointment') || 
                   'Confirme seu agendamento:\n\n' +
                   'Serviço: {service}\n' +
                   'Descrição: {description}\n' +
                   'Data: {date}\n' +
                   'Hora: {time}\n' +
                   'Valor: R$ {price}\n\n' +
                   'Digite:\n' +
                   '1 - Confirmar\n' +
                   '2 - Escolher outro horário\n' +
                   '3 - Cancelar agendamento';
    
    confirmMsg = confirmMsg.replace('{service}', sess.data.serviceType)
                         .replace('{description}', sess.data.description)
                         .replace('{date}', formattedDate)
                         .replace('{time}', formattedTime)
                         .replace('{price}', price);
    
    // Enviar confirmação e atualizar estado
    await sendText(jid, confirmMsg);
    sess.state = 'schedule_confirm';
    
    // Atualizar sessão
    await db.updateSession(sess.sessionId, { 
      menu: sess.state, 
      current_menu: sess.state 
    });
    
    console.log('Enviada confirmação, aguardando resposta');
  } catch (error) {
    console.error('Erro ao processar seleção de data:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao processar sua seleção. Por favor, tente novamente.');
    
    // Tentar voltar para a exibição dos slots
    if (sess.data && sess.data.slots && sess.data.slots.length > 0) {
      let optMsg = await db.getCustomText('available_slots_header') || 'Horários disponíveis:\n\n';
      
      sess.data.slots.forEach((s, i) => {
        const d = new Date(s.start);
        optMsg += `*${i+1}.* ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\n`;
      });
      
      await sendText(jid, optMsg);
      sess.state = 'schedule_date';
    } else {
      // Se não for possível, voltar para o menu principal
      sess.state = 'menu_main';
      await sendText(jid, formatMenu('main'));
    }
  }
}

/**
 * Processa a confirmação de agendamento
 * @param {Object} jid - ID do WhatsApp do usuário
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto da mensagem recebida
 * @returns {Promise<void>}
 */
async function handleScheduleConfirmation(jid, sess, text) {
  try {
    console.log(`Recebida confirmação: ${text}`);
    
    const choice = parseInt(text);
    
    if (isNaN(choice) || choice < 1 || choice > 3) {
      await sendText(jid, await db.getCustomText('invalid_option') || 'Opção inválida. Por favor, digite 1 para confirmar, 2 para escolher outro horário ou 3 para cancelar.');
      return;
    }
    
    if (choice === 1) {
      // Confirmar agendamento
      console.log('Confirmando agendamento...');
      
      // Criar evento no calendário
      const data = sess.data;
      const user = await db.getOrCreateUser(jid.split('@')[0]);
      
      const eventData = {
        start: data.selected.start,
        end: data.selected.end,
        summary: `Visita Técnica - ${data.serviceType}`,
        description: `Cliente: ${user.name || 'Não informado'}\nTelefone: ${user.phone}\nE-mail: ${user.email || 'Não informado'}\nDescrição: ${data.description}`,
        address: user.address || ''
      };
      
      // Tentar criar o evento
      let eventId = null;
      try {
        eventId = await calendar.createCalendarEvent(eventData);
        console.log(`Evento criado com ID: ${eventId}`);
      } catch (error) {
        console.error('Erro ao criar evento:', error);
      }
      
      if (!eventId) {
        await sendText(jid, await db.getCustomText('appointment_error') || 'Ocorreu um erro ao agendar. Por favor, tente novamente mais tarde.');
        sess.state = 'menu_main';
        await sendText(jid, formatMenu('main'));
        return;
      }
      
      // Salvar agendamento no banco
      try {
        await db.saveScheduling(sess.userId, {
          eventId,
          serviceType: data.serviceType,
          serviceOption: data.serviceType,
          description: data.description,
          appointmentDate: new Date(data.selected.start),
          status: 'confirmed',
          reminderSent: false
        });
        
        console.log('Agendamento salvo no banco');
      } catch (error) {
        console.error('Erro ao salvar agendamento:', error);
      }
      
      // Formatar data e hora para exibição
      const d = new Date(data.selected.start);
      const formattedDate = d.toLocaleDateString('pt-BR');
      const formattedTime = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      
      // Informar cliente com detalhes completos
      const confirmationMsg = `Agendamento Confirmado!\n\nServiço: ${data.serviceType}\nData: ${formattedDate}\nHorário: ${formattedTime}\nValor: R$ ${await db.getServicePrice(data.serviceType) || await db.getConfig('visit_price') || '150,00'}`;
      await sendText(jid, confirmationMsg);
      
      // Adicionar mensagem de lembrete (opcional)
      await sendText(jid, `Enviaremos uma mensagem 4 horas antes para confirmar sua disponibilidade.`);
      
      // Voltar para o menu principal
      sess.state = 'menu_main';
      await sendText(jid, formatMenu('main'));
      
    } else if (choice === 2) {
      // Escolher outro horário
      console.log('Cliente escolheu outro horário');
      sess.state = 'schedule_desc';
      await sendText(jid, await db.getCustomText('reschedule_prompt') || 'Vamos tentar novamente. Por favor, descreva brevemente o problema ou serviço que precisa:');
    } else {
      // Cancelar agendamento
      console.log('Cliente cancelou agendamento');
      await sendText(jid, await db.getCustomText('appointment_cancelled') || 'Agendamento cancelado.');
      sess.state = 'menu_main';
      await sendText(jid, formatMenu('main'));
    }
    
    // Atualizar sessão
    await db.updateSession(sess.sessionId, { 
      menu: sess.state, 
      current_menu: sess.state 
    });
  } catch (error) {
    console.error('Erro ao processar confirmação:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao processar sua confirmação. Por favor, tente novamente mais tarde.');
    sess.state = 'menu_main';
    await sendText(jid, formatMenu('main'));
  }
}

// Exporta as funções
module.exports = {
  startScheduling,
  handleScheduleService,
  handleScheduleDescription,
  handleDateSelection,
  handleScheduleConfirmation
};