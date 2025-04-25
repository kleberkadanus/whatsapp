// postSaleService.js - Módulo para gerenciar pesquisas de satisfação pós-venda
const db = require('./database');

/**
 * Inicia o fluxo de pesquisa pós-venda para um cliente
 * @param {String} phone - Número de telefone do cliente
 * @param {String} serviceType - Tipo de serviço realizado
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<Boolean>} - Se a pesquisa foi iniciada com sucesso
 */
async function startPostSaleSurvey(phone, serviceType, sendText) {
  try {
    console.log(`Iniciando pesquisa pós-venda para: ${phone}`);
    
    // Validar o número de telefone
    if (!phone || phone.length < 8) {
      console.error('Número de telefone inválido para pesquisa pós-venda');
      return false;
    }
    
    // Formatar o telefone para garantir o formato correto
    const formattedPhone = phone.replace(/\D/g, '');
    const jid = `${formattedPhone}@s.whatsapp.net`;
    
    // Buscar o cliente no banco
    const user = await db.getOrCreateUser(formattedPhone);
    
    if (!user || !user.id) {
      console.error(`Cliente não encontrado para o telefone: ${formattedPhone}`);
      return false;
    }
    
    // Verificar se já existe uma pesquisa recente para este cliente (menos de 7 dias)
    const recentSurvey = await checkRecentSurvey(user.id);
    if (recentSurvey) {
      console.log(`Cliente ${formattedPhone} já recebeu pesquisa recentemente. Pulando.`);
      return false;
    }
    
    // Criar ou atualizar sessão para o fluxo de pós-venda
    const existingSession = await db.getActiveSession(user.id);
    let sessionId;
    
    if (existingSession && existingSession.menu !== 'finished') {
      // Se já existir uma sessão ativa, não iniciar a pesquisa agora
      console.log(`Cliente ${formattedPhone} já está em atendimento. Pesquisa pós-venda não iniciada.`);
      return false;
    } else {
      // Criar nova sessão
      const newSession = await db.createSession(user.id, 'postsale_start');
      if (!newSession) {
        console.error(`Falha ao criar sessão para pós-venda: ${formattedPhone}`);
        return false;
      }
      sessionId = newSession.id;
    }
    
    // Registrar no banco que uma pesquisa foi iniciada
    await savePostSaleSurvey(user.id, serviceType);
    
    // Buscar o nome do cliente para personalização
    const clientName = user.name || 'cliente';
    
    // Buscar mensagem personalizada ou usar padrão
    const postSaleMsg = await db.getCustomText('postsale_initial_message') || 
                       `Olá ${clientName}, vimos que o técnico finalizou sua {service_type}. Gostaríamos de saber como foi sua experiência conosco!`;
    
    // Substituir variáveis na mensagem
    const customizedMsg = postSaleMsg.replace('{service_type}', serviceType || 'instalação/manutenção');
    
    // Enviar mensagem inicial
    await sendText(jid, customizedMsg);
    
    // Preparar para receber a avaliação com estrelas
    setTimeout(async () => {
      const ratingMsg = await db.getCustomText('postsale_rating_request') || 
                      'Por favor, avalie nosso serviço de 1 a 5 estrelas:\n\n' +
                      '1 ⭐ - Péssimo\n' +
                      '2 ⭐⭐ - Ruim\n' +
                      '3 ⭐⭐⭐ - Regular\n' +
                      '4 ⭐⭐⭐⭐ - Bom\n' +
                      '5 ⭐⭐⭐⭐⭐ - Excelente';
      
      await sendText(jid, ratingMsg);
      
      // Atualizar estado da sessão
      await db.updateSession(sessionId, {
        menu: 'postsale_rating',
        current_menu: 'postsale_rating'
      });
      
      // Atualizar sessões em memória
      global.sessions = global.sessions || {};
      global.sessions[jid] = {
        userId: user.id,
        state: 'postsale_rating',
        data: {
          surveyType: 'postsale',
          serviceType
        },
        withAgent: false,
        agent: null,
        sessionId,
        lastActivity: Date.now()
      };
    }, 1000);
    
    return true;
  } catch (error) {
    console.error('Erro ao iniciar pesquisa pós-venda:', error);
    return false;
  }
}

/**
 * Verifica se o cliente já recebeu uma pesquisa recente
 * @param {Number} userId - ID do usuário
 * @returns {Promise<Boolean>} - Se existe pesquisa recente
 */
async function checkRecentSurvey(userId) {
  try {
    // Definir período para considerar uma pesquisa como recente (7 dias)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Consultar banco de dados
    const [rows] = await db.pool.execute(
      'SELECT id FROM postsale_surveys WHERE user_id = ? AND created_at > ? LIMIT 1',
      [userId, sevenDaysAgo.toISOString()]
    );
    
    return rows && rows.length > 0;
  } catch (error) {
    console.error('Erro ao verificar pesquisas recentes:', error);
    return false;
  }
}

/**
 * Registra o início de uma pesquisa pós-venda
 * @param {Number} userId - ID do usuário
 * @param {String} serviceType - Tipo de serviço
 * @returns {Promise<Number|null>} - ID da pesquisa ou null em caso de erro
 */
async function savePostSaleSurvey(userId, serviceType) {
  try {
    const [result] = await db.pool.execute(
      'INSERT INTO postsale_surveys (user_id, service_type, status) VALUES (?, ?, ?)',
      [userId, serviceType || 'atendimento', 'started']
    );
    
    return result.insertId || null;
  } catch (error) {
    console.error('Erro ao salvar pesquisa pós-venda:', error);
    return null;
  }
}

/**
 * Processa a avaliação de estrelas da pesquisa pós-venda
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto com a avaliação
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function handlePostSaleRating(jid, sess, text, sendText) {
  try {
    const score = parseInt(text.trim());
    
    if (isNaN(score) || score < 1 || score > 5) {
      await sendText(jid, 'Por favor, digite um número de 1 a 5 para avaliar nosso serviço:');
      return;
    }
    
    // Salvar a nota na sessão
    sess.data = sess.data || {};
    sess.data.rating = score;
    
    // Salvar a avaliação no banco
    try {
      // Buscar pesquisa ativa para este usuário
      const [surveys] = await db.pool.execute(
        'SELECT id FROM postsale_surveys WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
        [sess.userId, 'started']
      );
      
      if (surveys && surveys.length > 0) {
        // Atualizar a pesquisa com a avaliação
        const surveyId = surveys[0].id;
        await db.pool.execute(
          'UPDATE postsale_surveys SET rating = ?, status = ? WHERE id = ?',
          [score, 'rated', surveyId]
        );
      }
      
      // Registrar também como uma avaliação normal
      await db.saveRating({
        userId: sess.userId,
        sessionId: sess.sessionId,
        agentPhone: null,
        menuPath: 'postsale',
        optionId: null,
        score: score,
        comment: `Avaliação pós-venda: ${sess.data.serviceType || 'Serviço'}`
      });
    } catch (dbError) {
      console.error('Erro ao salvar avaliação pós-venda:', dbError);
    }
    
    // Solicitar comentários ou críticas
    const commentMsg = await db.getCustomText('postsale_comment_request') || 
                     'Agora, por favor, descreva uma crítica ou elogio para que possamos melhorar cada vez mais nosso atendimento (ou escreva "pular" para continuar):';
    
    await sendText(jid, commentMsg);
    
    // Atualizar estado da sessão
    sess.state = 'postsale_comment';
    await db.updateSession(sess.sessionId, {
      menu: sess.state,
      current_menu: sess.state
    });
    
  } catch (error) {
    console.error('Erro ao processar avaliação pós-venda:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao registrar sua avaliação. Vamos continuar com a próxima pergunta.');
    
    // Tentar avançar para o próximo passo mesmo com erro
    sess.state = 'postsale_comment';
    await db.updateSession(sess.sessionId, {
      menu: sess.state,
      current_menu: sess.state
    });
    
    const commentMsg = await db.getCustomText('postsale_comment_request') || 
                     'Por favor, descreva uma crítica ou elogio para que possamos melhorar cada vez mais nosso atendimento (ou escreva "pular" para continuar):';
    
    await sendText(jid, commentMsg);
  }
}

/**
 * Processa o comentário da pesquisa pós-venda
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto com o comentário
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function handlePostSaleComment(jid, sess, text, sendText) {
  try {
    const comment = text.trim();
    
    // Se o usuário quiser pular
    if (comment.toLowerCase() === 'pular' || comment.toLowerCase() === 'sair') {
      // Não salvar comentário, apenas seguir para próxima etapa
    } else {
      // Salvar o comentário
      try {
        // Buscar pesquisa ativa para este usuário
        const [surveys] = await db.pool.execute(
          'SELECT id FROM postsale_surveys WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
          [sess.userId, 'rated']
        );
        
        if (surveys && surveys.length > 0) {
          // Atualizar a pesquisa com o comentário
          const surveyId = surveys[0].id;
          await db.pool.execute(
            'UPDATE postsale_surveys SET comment = ?, status = ? WHERE id = ?',
            [comment, 'commented', surveyId]
          );
        }
        
        // Registrar como mensagem
        await db.saveMessage(sess.userId, 'incoming', `[PÓS-VENDA] Comentário: ${comment}`);
      } catch (dbError) {
        console.error('Erro ao salvar comentário pós-venda:', dbError);
      }
    }
    
    // Perguntar sobre recomendação
    const recommendationMsg = await db.getCustomText('postsale_recommendation_question') || 
                            'Qual a chance de nos recomendar para um amigo ou familiar?\n\n' +
                            '1 - Vou sempre indicar\n' +
                            '2 - Talvez indique\n' +
                            '3 - Se não tiver outra opção\n' +
                            '4 - Não indicaria';
    
    await sendText(jid, recommendationMsg);
    
    // Atualizar estado da sessão
    sess.state = 'postsale_recommendation';
    await db.updateSession(sess.sessionId, {
      menu: sess.state,
      current_menu: sess.state
    });
    
  } catch (error) {
    console.error('Erro ao processar comentário pós-venda:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao registrar seu comentário. Vamos continuar com a próxima pergunta.');
    
    // Tentar avançar para o próximo passo mesmo com erro
    sess.state = 'postsale_recommendation';
    await db.updateSession(sess.sessionId, {
      menu: sess.state,
      current_menu: sess.state
    });
    
    const recommendationMsg = await db.getCustomText('postsale_recommendation_question') || 
                            'Qual a chance de nos recomendar para um amigo ou familiar?\n\n' +
                            '1 - Vou sempre indicar\n' +
                            '2 - Talvez indique\n' +
                            '3 - Se não tiver outra opção\n' +
                            '4 - Não indicaria';
    
    await sendText(jid, recommendationMsg);
  }
}

/**
 * Processa a resposta de recomendação da pesquisa pós-venda
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto com a resposta
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function handlePostSaleRecommendation(jid, sess, text, sendText) {
  try {
    const option = parseInt(text.trim());
    
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
    
    // Salvar recomendação
    try {
      // Buscar pesquisa ativa para este usuário
      const [surveys] = await db.pool.execute(
        'SELECT id FROM postsale_surveys WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
        [sess.userId, 'commented']
      );
      
      if (surveys && surveys.length > 0) {
        // Atualizar a pesquisa com a recomendação
        const surveyId = surveys[0].id;
        await db.pool.execute(
          'UPDATE postsale_surveys SET recommendation = ?, status = ? WHERE id = ?',
          [recommendationText, 'completed', surveyId]
        );
      }
      
      // Registrar como mensagem
      await db.saveMessage(sess.userId, 'incoming', `[PÓS-VENDA] Recomendação: ${recommendationText}`);
    } catch (dbError) {
      console.error('Erro ao salvar recomendação pós-venda:', dbError);
    }
    
    // Finalizar a pesquisa com agradecimento
    const thankYouMsg = await db.getCustomText('postsale_thank_you') || 
                      'Muito obrigado por participar da nossa pesquisa de satisfação! Seu feedback é muito importante para continuarmos melhorando nosso atendimento.';
    
    await sendText(jid, thankYouMsg);
    
    // Marcar a flag no banco para sinal de conclusão
    try {
      await db.pool.execute(
        'UPDATE postsale_settings SET value = ? WHERE setting = ?',
        ['false', 'postsale_pending']
      );
    } catch (flagError) {
      console.error('Erro ao atualizar flag de pós-venda:', flagError);
    }
    
    // Finalizar a sessão
    sess.state = 'finished';
    await db.updateSession(sess.sessionId, {
      menu: 'finished',
      current_menu: 'finished'
    });
    
    // Remover da memória
    const sessions = global.sessions || {};
    delete sessions[jid];
    
  } catch (error) {
    console.error('Erro ao processar recomendação pós-venda:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao registrar sua resposta.');
    
    // Finalizar mesmo com erro
    sess.state = 'finished';
    await db.updateSession(sess.sessionId, {
      menu: 'finished',
      current_menu: 'finished'
    });
    
    const sessions = global.sessions || {};
    delete sessions[jid];
  }
}

/**
 * API para iniciar pesquisa pós-venda a partir de outro sistema
 * @param {Object} req - Requisição HTTP
 * @param {Object} res - Resposta HTTP
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function apiStartPostSaleSurvey(req, res, sendText) {
  try {
    const { phone, serviceType, apiKey } = req.body;
    
    // Validar API key
    const validApiKey = await db.getConfig('api_key');
    if (apiKey !== validApiKey) {
      return res.status(401).json({ success: false, error: 'API key inválida' });
    }
    
    // Validar telefone
    if (!phone || phone.length < 8) {
      return res.status(400).json({ success: false, error: 'Número de telefone inválido' });
    }
    
    // Iniciar pesquisa
    const success = await startPostSaleSurvey(phone, serviceType, sendText);
    
    if (success) {
      // Atualizar flag no banco
      try {
        await db.pool.execute(
          'INSERT INTO postsale_settings (setting, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
          ['postsale_pending', 'true', 'true']
        );
      } catch (flagError) {
        console.error('Erro ao atualizar flag de pós-venda:', flagError);
      }
      
      res.json({ success: true, message: 'Pesquisa pós-venda iniciada com sucesso' });
    } else {
      res.status(500).json({ success: false, error: 'Não foi possível iniciar a pesquisa' });
    }
  } catch (error) {
    console.error('Erro na API de pós-venda:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao processar a requisição' });
  }
}

// Exportar funções
module.exports = {
  startPostSaleSurvey,
  handlePostSaleRating,
  handlePostSaleComment,
  handlePostSaleRecommendation,
  apiStartPostSaleSurvey
};