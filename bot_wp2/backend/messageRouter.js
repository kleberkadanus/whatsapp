// messageRouter.js - Módulo para rotear mensagens para os manipuladores corretos
const db = require('./database');

// Importar todos os módulos de funcionalidade
const { startScheduling, handleScheduleService, handleScheduleDescription, 
        handleDateSelection, handleScheduleConfirmation } = require('./schedulingHandlers');
const { handleAppointmentConfirmation } = require('./reminderService');
const { forwardToAgent, handleAgentChat } = require('./agentRouter');
const { requestRating, handleRating, handleRatingComment, handleRecommendation, 
        finalizeSession } = require('./ratingSystem');
const { sendPixKey, listInvoices, handleInvoiceSelection } = require('./financialModule');
const { startRegistration, handleName, handleAddress, handleComplement, 
        handleEmail, handleTermsAcceptance } = require('./userRegistration');
const { handlePostSaleRating, handlePostSaleComment, 
        handlePostSaleRecommendation } = require('./postSaleService');

/**
 * Roteador de mensagens que direciona para o módulo correto com base no estado da sessão
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto da mensagem
 * @param {Object} funcs - Objeto com funções de utilidade (sendText, sendImage, etc)
 * @returns {Promise<Boolean>} - Se a mensagem foi processada
 */
async function routeMessage(jid, sess, text, funcs) {
  try {
    console.log(`Roteando mensagem para estado: ${sess.state}`);
    
    // Extração de funções de utilidade
    const { sendText, sendImage, sendDocument, sendLocation, formatMenu } = funcs;
    
    // Verificar primeiro se é um comando global que funciona em qualquer estado
    if (text.toLowerCase() === '/menu') {
      sess.state = 'menu_main';
      await db.updateSession(sess.sessionId, { menu: sess.state, current_menu: sess.state });
      await sendText(jid, formatMenu('main'));
      return true;
    }
    
    // Verificar se está em chat com agente
    if (sess.state === 'chat') {
      return await handleAgentChat(jid, sess, text, sendText);
    }
    
    // Roteamento baseado no estado da sessão
    switch (sess.state) {
      // Estados de cadastro inicial
      case 'init':
        await startRegistration(jid, sess, sendText);
        return true;
        
      case 'await_name':
        await handleName(jid, sess, text, sendText);
        return true;
        
      case 'await_address':
        await handleAddress(jid, sess, text, sendText);
        return true;
        
      case 'await_complement':
        await handleComplement(jid, sess, text, sendText);
        return true;
        
      case 'await_email':
        await handleEmail(jid, sess, text, sendText, sendDocument);
        return true;
        
      case 'await_terms_acceptance':
        await handleTermsAcceptance(jid, sess, text, sendText);
        return true;
      
      // Estados de agendamento
      case 'schedule_service':
        await handleScheduleService(jid, sess, text, sendText);
        return true;
        
      case 'schedule_desc':
        await handleScheduleDescription(jid, sess, text, sendText);
        return true;
        
      case 'schedule_date':
        await handleDateSelection(jid, sess, text, sendText);
        return true;
        
      case 'schedule_confirm':
        await handleScheduleConfirmation(jid, sess, text, sendText);
        return true;
        
      // Confirmação de agendamento (lembrete)
      case 'confirm_appointment':
        await handleAppointmentConfirmation(jid, sess, text, sendText);
        return true;
        
      // Estados de avaliação
      case 'await_rating':
        await handleRating(jid, sess, text, sendText);
        return true;
        
      case 'await_rating_comment':
        await handleRatingComment(jid, sess, text, sendText);
        return true;
        
      case 'await_recommendation':
        await handleRecommendation(jid, sess, text, sendText);
        return true;
        
      // Estados de menu financeiro
      case 'invoice_selection':
        await handleInvoiceSelection(jid, sess, text, sendText, sendDocument);
        return true;
        
      // Estados de pesquisa pós-venda
      case 'postsale_rating':
        await handlePostSaleRating(jid, sess, text, sendText);
        return true;
        
      case 'postsale_comment':
        await handlePostSaleComment(jid, sess, text, sendText);
        return true;
        
      case 'postsale_recommendation':
        await handlePostSaleRecommendation(jid, sess, text, sendText);
        return true;
        
      // Estados de menu
      default:
        // Se o estado começa com "menu_", processar como seleção de menu
        if (sess.state && sess.state.startsWith('menu_')) {
          return await handleMenuSelection(jid, sess, text, funcs);
        }
        
        // Estado desconhecido
        console.warn(`Estado desconhecido: ${sess.state}`);
        sess.state = 'menu_main';
        await db.updateSession(sess.sessionId, { menu: sess.state, current_menu: sess.state });
        await sendText(jid, formatMenu('main'));
        return true;
    }
  } catch (error) {
    console.error('Erro no roteador de mensagens:', error);
    
    // Em caso de erro, tentar voltar para um estado seguro
    try {
      sess.state = 'menu_main';
      await db.updateSession(sess.sessionId, { menu: sess.state, current_menu: sess.state });
      await sendText(jid, 'Desculpe, tivemos um problema ao processar sua mensagem.');
      await sendText(jid, formatMenu('main'));
    } catch (recoveryError) {
      console.error('Erro ao tentar recuperar de falha:', recoveryError);
    }
    
    return false;
  }
}

/**
 * Processa seleções em menus
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto da mensagem
 * @param {Object} funcs - Objeto com funções de utilidade
 * @returns {Promise<Boolean>} - Se a mensagem foi processada
 */
async function handleMenuSelection(jid, sess, text, funcs) {
  try {
    const { sendText, sendImage, sendDocument, formatMenu } = funcs;
    
    // Extrair o nome do menu atual do estado da sessão
    const currentMenu = sess.state.substring(5); // Remove 'menu_'
    
    // Verificar se o texto é um comando especial
    if (text.toLowerCase() === 'menu') {
      await sendText(jid, formatMenu(currentMenu));
      return true;
    }
    
    // Tratar como seleção numérica
    const selection = parseInt(text.trim());
    
    if (isNaN(selection)) {
      await sendText(jid, await db.getCustomText('invalid_option') || 'Opção inválida. Por favor, digite o número da opção desejada:');
      return true;
    }
    
    // Carregar menu atual
    const menus = require('./menuManager').getMenus();
    const menu = menus[currentMenu];
    
    if (!menu) {
      console.warn(`Menu não encontrado: ${currentMenu}`);
      sess.state = 'menu_main';
      await db.updateSession(sess.sessionId, { menu: sess.state, current_menu: sess.state });
      await sendText(jid, formatMenu('main'));
      return true;
    }
    
    // Buscar opção selecionada
    const option = menu.options.find(o => o.id === selection);
    
    if (!option) {
      await sendText(jid, await db.getCustomText('invalid_option') || 'Opção inválida. Por favor, selecione uma opção válida:');
      return true;
    }
    
    // Registrar a escolha do usuário
    await db.updateUserLastChoice(sess.userId, currentMenu, selection);
    
    // Processar com base no handler da opção
    switch (option.handler) {
      case 'forward':
      case 'forwardToAgent':
        await forwardToAgent(jid, sess, option, '', sendText);
        return true;
        
      case 'startScheduling':
      case 'scheduleService':
        sess.data = sess.data || {};
        sess.data.serviceType = option.title || option.serviceType || 'Visita Técnica';
        await startScheduling(jid, sess, sendText);
        return true;
        
      case 'sendPixKey':
        await sendPixKey(jid, sess, sendText, sendImage);
        return true;
        
      case 'listInvoices':
        await listInvoices(jid, sess, sendText);
        return true;
        
      default:
        // Se tem menu seguinte, navegar para ele
        if (option.next_menu) {
          sess.state = `menu_${option.next_menu}`;
          await db.updateSession(sess.sessionId, { menu: sess.state, current_menu: sess.state });
          await sendText(jid, formatMenu(option.next_menu));
          return true;
        }
        
        // Opção sem handler específico, apenas confirmar seleção
        await sendText(jid, `Você selecionou: ${option.title}`);
        return true;
    }
  } catch (error) {
    console.error('Erro ao processar seleção de menu:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao processar sua seleção.');
    return false;
  }
}

/**
 * Exportar funções do roteador de mensagens
 */
module.exports = {
  routeMessage,
  handleMenuSelection
};