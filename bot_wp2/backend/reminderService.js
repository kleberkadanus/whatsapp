// reminderService.js - Módulo para gerenciar lembretes e confirmação de visitas técnicas
const db = require('./database');
const calendar = require('./calendar');

/**
 * Função para verificar agendamentos próximos e enviar lembretes
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<Array>} - Quantidade de lembretes enviados
 */
async function checkUpcomingAppointments(sendText) {
  try {
    console.log('Verificando agendamentos próximos para enviar lembretes');
    
    // Definir intervalo de tempo (agendamentos nas próximas 4-5 horas)
    const now = new Date();
    const fourHoursLater = new Date(now);
    fourHoursLater.setHours(now.getHours() + 4);
    
    const fiveHoursLater = new Date(now);
    fiveHoursLater.setHours(now.getHours() + 5);
    
    // Buscar agendamentos nesse intervalo que ainda não receberam lembrete
    const appointments = await db.getSchedulingsByDateRange(fourHoursLater, fiveHoursLater);
    
    console.log(`Encontrados ${appointments.length} agendamentos próximos`);
    
    // Array para armazenar promessas de envio
    const reminderPromises = [];
    
    // Processar cada agendamento
    for (const appointment of appointments) {
      // Pular se já foi enviado lembrete ou não está confirmado
      if (appointment.reminder_sent || appointment.status !== 'confirmed') {
        continue;
      }
      
      // Formatar data e hora
      const date = new Date(appointment.appointment_date);
      const formattedDate = date.toLocaleDateString('pt-BR');
      const formattedTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      
      // Obter texto personalizado ou usar padrão
      const reminderText = await db.getCustomText('appointment_confirmation') || 
        `Olá! Lembrete da sua visita técnica agendada para hoje às {time}.\n\n` +
        `Serviço: {service}\n` +
        `Endereço: {address}\n\n` +
        `Por favor, confirme sua disponibilidade:\n` +
        `1 - Confirmo o agendamento\n` +
        `2 - Preciso cancelar`;
      
      // Substituir variáveis no texto
      const messageText = reminderText
        .replace('{time}', formattedTime)
        .replace('{service}', appointment.service_type || 'Visita Técnica')
        .replace('{address}', appointment.address || 'Endereço não informado');
      
      // Enviar mensagem
      const userJid = `${appointment.phone}@s.whatsapp.net`;
      
      console.log(`Enviando lembrete para ${appointment.phone} - Agendamento ID: ${appointment.id}`);
      
      // Criar sessão temporária para confirmação
      try {
        // Se não existe sessão, criar
        const existingSession = await db.getActiveSession(appointment.user_id);
        
        if (!existingSession || existingSession.menu === 'finished') {
          const newSession = await db.createSession(appointment.user_id, 'confirm_appointment');
          
          if (newSession) {
            // Adicionar à memória
            const tempSession = {
              userId: appointment.user_id,
              state: 'confirm_appointment',
              data: {
                appointmentId: appointment.id,
                eventId: appointment.event_id
              },
              withAgent: false,
              agent: null,
              sessionId: newSession.id,
              lastActivity: Date.now()
            };
            
            // Armazenar globalmente (será necessário acessar esta variável em index.js)
            global.sessions = global.sessions || {};
            global.sessions[userJid] = tempSession;
          }
        } else {
          // Atualizar sessão existente
          await db.updateSession(existingSession.id, {
            menu: 'confirm_appointment',
            current_menu: 'confirm_appointment'
          });
          
          // Atualizar em memória
          global.sessions = global.sessions || {};
          global.sessions[userJid] = {
            userId: appointment.user_id,
            state: 'confirm_appointment',
            data: {
              appointmentId: appointment.id,
              eventId: appointment.event_id
            },
            withAgent: false,
            agent: null,
            sessionId: existingSession.id,
            lastActivity: Date.now()
          };
        }
        
        // Adicionar promessa de envio ao array
        reminderPromises.push(
          sendText(userJid, messageText)
            .then(() => {
              // Marcar que o lembrete foi enviado
              return db.updateSchedulingReminder(appointment.id, true);
            })
            .catch(err => {
              console.error(`Erro ao enviar lembrete para ${appointment.phone}:`, err);
              return false;
            })
        );
        
      } catch (sessionError) {
        console.error(`Erro ao criar/atualizar sessão para lembrete:`, sessionError);
      }
    }
    
    // Aguardar todos os envios
    await Promise.all(reminderPromises);
    
    return reminderPromises.length;
  } catch (error) {
    console.error('Erro ao verificar agendamentos próximos:', error);
    return 0;
  }
}

/**
 * Processa a resposta de confirmação do agendamento
 * @param {Object} jid - ID do WhatsApp do usuário
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto da mensagem recebida
 * @param {Function} sendText - Função para enviar mensagens 
 * @returns {Promise<void>}
 */
async function handleAppointmentConfirmation(jid, sess, text, sendText) {
  try {
    console.log(`Recebida resposta de confirmação: ${text}`);
    
    // Verificar opção selecionada
    const option = parseInt(text);
    
    if (isNaN(option) || (option !== 1 && option !== 2)) {
      // Resposta inválida
      await sendText(jid, await db.getCustomText('invalid_confirmation_option') || 
        'Por favor, digite 1 para confirmar ou 2 para cancelar o agendamento.');
      return;
    }
    
    // Buscar informações do agendamento
    const appointment = await db.getSchedulingById(sess.data.appointmentId);
    
    if (!appointment) {
      await sendText(jid, 'Não foi possível encontrar o agendamento. Por favor, contate nosso suporte.');
      sess.state = 'menu_main';
      await db.updateSession(sess.sessionId, { menu: 'menu_main', current_menu: 'menu_main' });
      return;
    }
    
    if (option === 1) {
      // Confirmar agendamento
      await db.updateSchedulingStatus(sess.data.appointmentId, 'confirmed');
      
      // Mensagem de confirmação
      const confirmText = await db.getCustomText('appointment_confirmed') || 
        'Obrigado pela confirmação! Esperamos você no horário agendado.';
      
      await sendText(jid, confirmText);
      
    } else {
      // Cancelar agendamento
      await db.updateSchedulingStatus(sess.data.appointmentId, 'cancelled');
      
      // Tentar cancelar no Google Calendar
      try {
        if (sess.data.eventId) {
          await calendar.cancelCalendarEvent(sess.data.eventId);
        }
      } catch (calendarError) {
        console.error('Erro ao cancelar evento no calendário:', calendarError);
      }
      
      // Mensagem de cancelamento
      const cancelText = await db.getCustomText('appointment_cancelled_by_user') || 
        'Seu agendamento foi cancelado conforme solicitado. Caso precise remarcar, entre em contato conosco.';
      
      await sendText(jid, cancelText);
      
      // Opcionalmente notificar um agente sobre o cancelamento
      try {
        const agentPhone = await db.getConfig('scheduling_agent');
        if (agentPhone) {
          const notification = `🚫 Agendamento cancelado pelo cliente:\n` +
            `Cliente: ${appointment.name || appointment.phone}\n` +
            `Data/Hora: ${new Date(appointment.appointment_date).toLocaleString('pt-BR')}\n` +
            `Serviço: ${appointment.service_type}`;
          
          await sendText(`${agentPhone}@s.whatsapp.net`, notification);
        }
      } catch (notifyError) {
        console.error('Erro ao notificar agente sobre cancelamento:', notifyError);
      }
    }
    
    // Retornar para o menu principal
    sess.state = 'menu_main';
    await db.updateSession(sess.sessionId, { menu: 'menu_main', current_menu: 'menu_main' });
    
    // Mostrar menu principal
    const menus = require('./menuManager').getMenus();
    await sendText(jid, formatMenu('main', menus));
    
  } catch (error) {
    console.error('Erro ao processar confirmação de agendamento:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao processar sua resposta. Por favor, entre em contato com nosso suporte.');
    
    // Tentar retornar ao menu principal mesmo com erro
    try {
      sess.state = 'menu_main';
      await db.updateSession(sess.sessionId, { menu: 'menu_main', current_menu: 'menu_main' });
      const menus = require('./menuManager').getMenus();
      await sendText(jid, formatMenu('main', menus));
    } catch (menuError) {
      console.error('Erro ao retornar ao menu principal:', menuError);
    }
  }
}