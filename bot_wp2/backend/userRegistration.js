// userRegistration.js - Módulo para gerenciar cadastro inicial e termos de aceite LGPD
const db = require('./database');
const fs = require('fs').promises;
const path = require('path');

/**
 * Verifica se um arquivo existe
 * @param {String} filePath - Caminho do arquivo
 * @returns {Promise<Boolean>} - Se o arquivo existe
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inicia processo de cadastro para novo usuário
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function startRegistration(jid, sess, sendText) {
  try {
    // Enviar mensagem de boas-vindas para primeiro contato
    const welcomeMsg = await db.getCustomText('first_welcome') || 
                      'Olá! Bem-vindo ao nosso atendimento. Para começarmos, precisamos de algumas informações básicas.';
    
    await sendText(jid, welcomeMsg);
    
    // Solicitar nome completo
    await sendText(jid, await db.getCustomText('ask_name') || 'Por favor, informe seu nome completo:');
    
    // Atualizar estado da sessão
    sess.state = 'await_name';
    await db.updateSession(sess.sessionId, { 
      menu: sess.state,
      current_menu: sess.state
    });
    
  } catch (error) {
    console.error('Erro ao iniciar cadastro:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao iniciar seu cadastro. Por favor, tente novamente em alguns instantes.');
  }
}

/**
 * Processa o nome informado pelo cliente
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto com o nome
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function handleName(jid, sess, text, sendText) {
  try {
    const name = text.trim();
    
    // Validar entrada
    if (name.length < 3) {
      await sendText(jid, 'Por favor, informe seu nome completo válido:');
      return;
    }
    
    // Salvar nome no banco
    const phone = jid.split('@')[0];
    const user = await db.getOrCreateUser(phone);
    
    if (!user || !user.id) {
      throw new Error('Falha ao recuperar usuário');
    }
    
    await db.updateUserDetails(user.id, { name });
    
    // Solicitar endereço
    await sendText(jid, await db.getCustomText('ask_address') || 'Agora, informe seu endereço completo:');
    
    // Atualizar estado da sessão
    sess.state = 'await_address';
    await db.updateSession(sess.sessionId, { 
      menu: sess.state,
      current_menu: sess.state
    });
    
  } catch (error) {
    console.error('Erro ao processar nome:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao registrar seu nome. Por favor, tente novamente:');
  }
}

/**
 * Processa o endereço informado pelo cliente
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto com o endereço
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function handleAddress(jid, sess, text, sendText) {
  try {
    const address = text.trim();
    
    // Validar entrada
    if (address.length < 5) {
      await sendText(jid, 'Por favor, informe um endereço válido e completo:');
      return;
    }
    
    // Salvar endereço no banco
    const phone = jid.split('@')[0];
    const user = await db.getOrCreateUser(phone);
    
    if (!user || !user.id) {
      throw new Error('Falha ao recuperar usuário');
    }
    
    await db.updateUserDetails(user.id, { address });
    
    // Solicitar complemento
    await sendText(jid, await db.getCustomText('ask_address_complement') || 'Informe o complemento do endereço (apartamento, bloco, etc):');
    
    // Atualizar estado da sessão
    sess.state = 'await_complement';
    await db.updateSession(sess.sessionId, { 
      menu: sess.state,
      current_menu: sess.state
    });
    
  } catch (error) {
    console.error('Erro ao processar endereço:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao registrar seu endereço. Por favor, tente novamente:');
  }
}

/**
 * Processa o complemento do endereço
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto com o complemento
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function handleComplement(jid, sess, text, sendText) {
  try {
    const complement = text.trim();
    
    // Salvar complemento no banco
    const phone = jid.split('@')[0];
    const user = await db.getOrCreateUser(phone);
    
    if (!user || !user.id) {
      throw new Error('Falha ao recuperar usuário');
    }
    
    await db.updateUserDetails(user.id, { complement });
    
    // Solicitar email
    await sendText(jid, await db.getCustomText('ask_email') || 'Por último, informe seu e-mail:');
    
    // Atualizar estado da sessão
    sess.state = 'await_email';
    await db.updateSession(sess.sessionId, { 
      menu: sess.state,
      current_menu: sess.state
    });
    
  } catch (error) {
    console.error('Erro ao processar complemento:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao registrar o complemento. Por favor, tente novamente:');
  }
}

/**
 * Processa o email informado pelo cliente
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto com o email
 * @param {Function} sendText - Função para enviar mensagens
 * @param {Function} sendDocument - Função para enviar documentos
 * @returns {Promise<void>}
 */
async function handleEmail(jid, sess, text, sendText, sendDocument) {
  try {
    const email = text.trim().toLowerCase();
    
    // Validação básica de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      await sendText(jid, 'Por favor, informe um e-mail válido:');
      return;
    }
    
    // Salvar email no banco
    const phone = jid.split('@')[0];
    const user = await db.getOrCreateUser(phone);
    
    if (!user || !user.id) {
      throw new Error('Falha ao recuperar usuário');
    }
    
    await db.updateUserDetails(user.id, { email });
    
    // Buscar documento de termos LGPD
    const termsPath = await db.getConfig('lgpd_terms_path') || './resources/termos_lgpd.pdf';
    
    // Verificar se o documento existe
    if (await fileExists(termsPath)) {
      // Enviar mensagem sobre os termos
      const termsMessage = await db.getCustomText('lgpd_terms_message') || 
                          'Obrigado pelos seus dados! Para prosseguir, precisamos que você leia e aceite nossos termos de uso e política de privacidade, em conformidade com a Lei Geral de Proteção de Dados (LGPD).';
      
      await sendText(jid, termsMessage);
      
      // Enviar documento PDF
      await sendDocument(jid, termsPath, 'Termos_de_Uso_e_LGPD.pdf', 'Termos de Uso e Privacidade');
      
      // Aguardar um pouco para enviar a mensagem de aceite
      setTimeout(async () => {
        // Solicitar aceite
        const acceptMessage = await db.getCustomText('lgpd_accept_message') || 
                            'Após ler os termos, por favor, confirme:\n\n' +
                            '*1.* Eu aceito os termos\n' +
                            '*2.* Eu não aceito';
        
        await sendText(jid, acceptMessage);
        
        // Atualizar estado da sessão
        sess.state = 'await_terms_acceptance';
        await db.updateSession(sess.sessionId, { 
          menu: sess.state,
          current_menu: sess.state
        });
      }, 3000);
    } else {
      console.warn('Arquivo de termos LGPD não encontrado:', termsPath);
      
      // Enviar mensagem simplificada sem o documento
      const simplifiedTerms = await db.getCustomText('lgpd_simplified_terms') || 
                           'Ao prosseguir, você concorda com nossos termos de uso e privacidade, que incluem o armazenamento e processamento dos seus dados para fins de atendimento, em conformidade com a Lei Geral de Proteção de Dados (LGPD).\n\n' +
                           '*1.* Eu aceito\n' +
                           '*2.* Eu não aceito';
      
      await sendText(jid, simplifiedTerms);
      
      // Atualizar estado da sessão
      sess.state = 'await_terms_acceptance';
      await db.updateSession(sess.sessionId, { 
        menu: sess.state,
        current_menu: sess.state
      });
    }
    
  } catch (error) {
    console.error('Erro ao processar email:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao registrar seu e-mail. Por favor, tente novamente:');
  }
}

/**
 * Processa a resposta do cliente aos termos LGPD
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto com a resposta
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function handleTermsAcceptance(jid, sess, text, sendText) {
  try {
    const choice = parseInt(text.trim());
    
    if (isNaN(choice) || (choice !== 1 && choice !== 2)) {
      await sendText(jid, 'Por favor, digite 1 para aceitar ou 2 para não aceitar os termos:');
      return;
    }
    
    // Recuperar usuário
    const phone = jid.split('@')[0];
    const user = await db.getOrCreateUser(phone);
    
    if (choice === 1) {
      // Usuário aceitou os termos
      
      // Registrar aceitação no banco
      try {
        await db.saveMessage(user.id, 'incoming', '[LGPD] Cliente aceitou os termos de uso e privacidade');
        
        // Implementar função específica para registrar aceitação
        await saveTermsAcceptance(user.id);
      } catch (acceptError) {
        console.error('Erro ao salvar aceitação dos termos:', acceptError);
      }
      
      // Mensagem de agradecimento
      const thankYouMsg = await db.getCustomText('terms_accepted') || 
                        'Obrigado por aceitar os termos! Agora você pode acessar todos os nossos serviços.';
      
      await sendText(jid, thankYouMsg);
      
      // Mostrar menu principal
      sess.state = 'menu_main';
      await db.updateSession(sess.sessionId, { 
        menu: sess.state,
        current_menu: sess.state
      });
      
      // Exibir o menu principal
      await sendText(jid, formatMenu('main'));
      
    } else {
      // Usuário não aceitou os termos
      
      // Registrar recusa no banco
      try {
        await db.saveMessage(user.id, 'incoming', '[LGPD] Cliente recusou os termos de uso e privacidade');
      } catch (rejectError) {
        console.error('Erro ao salvar recusa dos termos:', rejectError);
      }
      
      // Recuperar telefone do agente de suporte
      const agentPhone = await db.getConfig('lgpd_agent') || await db.getConfig('support_agent') || '';
      
      // Encaminhar para atendente especializado
      if (agentPhone) {
        // Configurar opção para encaminhamento
        const agentOption = {
          agent_phone: agentPhone,
          handler: 'forward'
        };
        
        // Mensagem informando que será encaminhado
        const forwardMsg = await db.getCustomText('terms_rejected_forward') || 
                         'Entendemos sua decisão. Para garantir que possamos atendê-lo adequadamente sem utilizar seus dados, vamos transferi-lo para um atendente especializado.';
        
        await sendText(jid, forwardMsg);
        
        // Importar e usar a função de encaminhamento
        const agentRouter = require('./agentRouter');
        await agentRouter.forwardToAgent(jid, sess, agentOption, 'Cliente recusou termos LGPD', sendText);
      } else {
        // Sem agente configurado, enviar mensagem de encerramento
        const endMsg = await db.getCustomText('terms_rejected') || 
                     'Entendemos sua decisão. Infelizmente, não podemos prosseguir com o atendimento sem o aceite dos termos, conforme exigido pela legislação. Caso mude de ideia, estamos à disposição.';
        
        await sendText(jid, endMsg);
        
        // Finalizar sessão
        sess.state = 'finished';
        await db.updateSession(sess.sessionId, { 
          menu: sess.state,
          current_menu: sess.state
        });
      }
    }
    
  } catch (error) {
    console.error('Erro ao processar resposta aos termos:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao processar sua resposta. Por favor, tente novamente:');
  }
}

/**
 * Salva o registro de aceitação dos termos pelo usuário
 * @param {Number} userId - ID do usuário
 * @returns {Promise<Boolean>} - Se foi salvo com sucesso
 */
async function saveTermsAcceptance(userId) {
  try {
    // Verificar se já existe registro para não duplicar
    const [existingRows] = await db.pool.execute(
      'SELECT id FROM terms_acceptance WHERE user_id = ? LIMIT 1',
      [userId]
    );
    
    if (existingRows && existingRows.length > 0) {
      // Atualizar registro existente
      await db.pool.execute(
        'UPDATE terms_acceptance SET accepted = 1, acceptance_date = NOW() WHERE user_id = ?',
        [userId]
      );
    } else {
      // Criar novo registro
      await db.pool.execute(
        'INSERT INTO terms_acceptance (user_id, accepted, acceptance_date) VALUES (?, 1, NOW())',
        [userId]
      );
    }
    
    return true;
  } catch (error) {
    console.error('Erro ao salvar aceitação dos termos:', error);
    return false;
  }
}

// Exportar funções
module.exports = {
  startRegistration,
  handleName,
  handleAddress,
  handleComplement,
  handleEmail,
  handleTermsAcceptance
};