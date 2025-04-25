// ratingSystem.js - Módulo para gerenciar avaliações de atendimento
const db = require('./database');

/**
 * Solicita avaliação ao cliente
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão do cliente
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function requestRating(jid, sess, sendText) {
  try {
    const msg = await db.getCustomText('rating_request') || 
              'Gostaríamos de saber como foi sua experiência conosco.\nPor favor, avalie nosso atendimento de 1 a 5\n\n' +
              '1. ⭐ - Péssimo\n' +
              '2. ⭐⭐ - Ruim\n' +
              '3. ⭐⭐⭐ - Regular\n' +
              '4. ⭐⭐⭐⭐ - Bom\n' +
              '5. ⭐⭐⭐⭐⭐ - Excelente';
              
    await sendText(jid, msg);
    sess.state = 'await_rating';
    
    // Atualizar sessão
    await db.updateSession(sess.sessionId, { 
      menu: sess.state, 
      current_menu: sess.state 
    });
  } catch (error) {
    console.error('Erro ao solicitar avaliação:', error);
    // Em caso de erro, pular para o final do atendimento
    await finalizeSession(jid, sess, sendText);
  }
}

/**
 * Processa a avaliação recebida do cliente
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão do cliente
 * @param {String} text - Texto com a avaliação
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function handleRating(jid, sess, text, sendText) {
  try {
    const score = parseInt(text);
    
    if (isNaN(score) || score < 1 || score > 5) {
      await sendText(jid, await db.getCustomText('invalid_rating') || 
                   'Por favor, digite um número de 1 a 5:');
      return;
    }
    
    // Salvar a nota na sessão
    sess.data = sess.data || {};
    sess.data.rating = score;
    
    // Confirmar a avaliação
    let confirmationMsg = '';
    if (score <= 2) {
      confirmationMsg = 'Lamentamos que sua experiência não tenha sido satisfatória.';
    } else if (score === 3) {
      confirmationMsg = 'Obrigado pela sua avaliação.';
    } else {
      confirmationMsg = 'Obrigado pela sua avaliação positiva!';
    }
    
    await sendText(jid, confirmationMsg);
    
    // Solicitar comentário
    await sendText(jid, await db.getCustomText('rating_comment') || 
                 'Gostaria de adicionar algum comentário? (digite seu comentário ou "pular" para finalizar)');
    
    sess.state = 'await_rating_comment';
    
    // Atualizar sessão
    await db.updateSession(sess.sessionId, { 
      menu: sess.state, 
      current_menu: sess.state 
    });
  } catch (error) {
    console.error('Erro ao processar avaliação:', error);
    // Em caso de erro, pular para o final do atendimento
    await finalizeSession(jid, sess, sendText);
  }
}

/**
 * Processa o comentário da avaliação
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão do cliente
 * @param {String} text - Texto com o comentário
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function handleRatingComment(jid, sess, text, sendText) {
  try {
    console.log(`Recebido comentário de avaliação: "${text}"`);
    const comment = text.toLowerCase() === 'pular' ? null : text;
    
    // Salvar score em variável local para evitar o erro de undefined
    sess.data = sess.data || {};
    const rating_score = sess.data.rating;
    
    if (!rating_score) {
      console.warn('Score de avaliação não encontrado, usando valor padrão 5');
    }
    
    // Salvar avaliação no banco com verificação de valores nulos
    try {
      await db.saveRating({
        userId: sess.userId,
        sessionId: sess.sessionId,
        agentPhone: sess.agent || null,
        menuPath: sess.data.serviceType ? 'agendamento' : 'atendimento',
        optionId: null,
        score: rating_score || 5, // Usar 5 como fallback se rating não estiver definido
        comment: comment
      });
      
      console.log(`Avaliação salva: ${rating_score || 5} estrelas`);
    } catch (error) {
      console.error('Erro ao salvar avaliação:', error);
      // Continuar mesmo com erro para finalizar o atendimento
    }
    
    // Agradecer pelo feedback
    await sendText(jid, await db.getCustomText('rating_thank_you') || 
                 'Obrigado pelo seu feedback! Sua opinião é muito importante para melhorarmos nossos serviços.');
    
    // Adicionar pergunta de recomendação
    await sendText(jid, await db.getCustomText('recommendation_question') || 
                 'Qual a chance de nos recomendar para um amigo ou familiar?\n\n' +
                 '1 - Vou sempre indicar\n' +
                 '2 - Talvez indique\n' +
                 '3 - Se não tiver outra opção\n' +
                 '4 - Não indicaria');
    
    sess.state = 'await_recommendation';
    
    // Atualizar sessão
    await db.updateSession(sess.sessionId, { 
      menu: sess.state, 
      current_menu: sess.state 
    });
  } catch (error) {
    console.error('Erro ao processar comentário da avaliação:', error);
    // Em caso de erro, pular para o final do atendimento
    await finalizeSession(jid, sess, sendText);
  }
}

/**
 * Processa a resposta sobre recomendação
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão do cliente
 * @param {String} text - Texto com a resposta
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function handleRecommendation(jid, sess, text, sendText) {
  try {
    const option = parseInt(text);
    
    if (isNaN(option) || option < 1 || option > 4) {
      await sendText(jid, 'Por favor, escolha uma opção de 1 a 4:');
      return;
    }
    
    // Mapear opção para texto
    const recommendationText = [
      'Vou sempre indicar',
      'Talvez indique',
      'Se não tiver outra opção',
      'Não indicaria'
    ][option - 1];
    
    // Salvar recomendação no banco
    try {
      // Atualizar avaliação anterior com a recomendação
      // Implementar função no banco de dados se necessário
      console.log(`Recomendação registrada: ${recommendationText}`);
      
      // Alternativa: salvar como um comentário adicional
      await db.saveMessage(sess.userId, 'incoming', `[Recomendação] ${recommendationText}`);
    } catch (error) {
      console.error('Erro ao salvar recomendação:', error);
    }
    
    // Agradecer pela participação
    await sendText(jid, await db.getCustomText('final_thank_you') || 
                 'Agradecemos muito sua participação! Seus comentários nos ajudam a melhorar continuamente.');
    
    // IMPORTANTE: Finalizar a sessão completamente
    await finalizeSession(jid, sess, sendText);
  } catch (error) {
    console.error('Erro ao processar recomendação:', error);
    // Em caso de erro, pular para o final do atendimento
    await finalizeSession(jid, sess, sendText);
  }
}

/**
 * Finaliza a sessão do cliente
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão do cliente
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function finalizeSession(jid, sess, sendText) {
  try {
    console.log(`Finalizando sessão para ${jid}`);
    
    // 1. Remover da sessão em memória
    const sessions = global.sessions || {};
    delete sessions[jid];
    
    // 2. Marcar sessão como finalizada no banco
    if (sess && sess.sessionId) {
      try {
        await db.updateSession(sess.sessionId, { 
          menu: 'finished', 
          current_menu: 'finished' 
        });
        console.log(`Sessão ${sess.sessionId} marcada como finalizada no banco de dados`);
      } catch (dbError) {
        console.error('Erro ao desativar sessão no banco:', dbError);
      }
    }
    
    // 3. Mensagem de despedida
    await sendText(jid, await db.getCustomText('goodbye_message') || 
                 'Obrigado por utilizar nossos serviços! Estamos à disposição quando precisar novamente.');
    
    // 4. Forçar criação de sessão limpa na próxima interação
    const phone = jid.split('@')[0];
    try {
      // Encerrar todas as sessões ativas do usuário
      const user = await db.getOrCreateUser(phone);
      if (user && user.id) {
        await db.updateSession(null, { 
          userId: user.id, 
          allSessions: true, // Sinal para atualizar todas as sessões deste usuário
          menu: 'finished', 
          current_menu: 'finished' 
        });
      }
    } catch (error) {
      console.error('Erro ao limpar sessões antigas:', error);
    }
    
    console.log(`Sessão finalizada para ${jid}`);
  } catch (error) {
    console.error('Erro ao finalizar sessão:', error);
  }
}

// Exportar funções
module.exports = {
  requestRating,
  handleRating,
  handleRatingComment,
  handleRecommendation,
  finalizeSession
};