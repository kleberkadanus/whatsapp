// financialModule.js - Módulo para gerenciar funções financeiras (PIX e Boletos)
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
 * Envia a chave PIX para o cliente
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão do cliente
 * @param {Function} sendText - Função para enviar mensagens
 * @param {Function} sendImage - Função para enviar imagens (QR Code opcional)
 * @returns {Promise<void>}
 */
async function sendPixKey(jid, sess, sendText, sendImage) {
  try {
    console.log(`Enviando chave PIX para ${jid}`);
    
    // Buscar a chave PIX no banco de dados
    const pixKey = await db.getConfig('pix_key');
    const pixKeyName = await db.getConfig('pix_key_name') || 'Nossa Empresa';
    const pixKeyType = await db.getConfig('pix_key_type') || 'CNPJ';
    
    if (!pixKey) {
      await sendText(jid, 'Desculpe, não foi possível recuperar nossa chave PIX. Por favor, entre em contato com nosso suporte.');
      return;
    }
    
    // Buscar texto personalizado ou usar padrão
    const pixMessage = await db.getCustomText('pix_message') || 
                      `💰 *Nossa Chave PIX*\n\n` +
                      `${pixKeyType}: ${pixKey}\n` +
                      `Nome: ${pixKeyName}\n\n` +
                      `Você pode copiar a chave acima ou usar o QR Code. Após realizar o pagamento, envie o comprovante para nosso atendente.`;
    
    // Enviar a mensagem com a chave PIX
    await sendText(jid, pixMessage);
    
    // Verificar se existe um QR Code PIX armazenado e enviar
    try {
      const qrCodePath = await db.getConfig('pix_qrcode_path');
      
      if (qrCodePath && await fileExists(qrCodePath)) {
        // Enviar o QR Code como imagem
        await sendImage(jid, qrCodePath, 'QR Code PIX');
      } else {
        console.log('QR Code do PIX não encontrado. Enviando apenas a chave textual.');
      }
    } catch (qrError) {
      console.error('Erro ao enviar QR Code do PIX:', qrError);
      // Continuar sem enviar QR Code
    }
    
    // Registrar interação
    await db.saveMessage(sess.userId, 'outgoing', '[PIX] Chave PIX enviada ao cliente');
    
    // Perguntar se deseja algo mais
    setTimeout(async () => {
      await sendText(jid, await db.getCustomText('anything_else') || 
                   'Posso ajudar com mais alguma coisa?');
    }, 2000); // Pequeno delay para melhor experiência
    
  } catch (error) {
    console.error('Erro ao enviar chave PIX:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao recuperar nossa chave PIX. Por favor, tente novamente em instantes.');
  }
}

/**
 * Busca boletos do cliente no banco de dados
 * @param {Number} userId - ID do usuário/cliente
 * @returns {Promise<Array>} - Lista de boletos
 */
async function getClientInvoices(userId) {
  try {
    // Consulta ao banco de dados
    const [rows] = await db.pool.execute(
      'SELECT * FROM invoices WHERE user_id = ? ORDER BY due_date DESC',
      [userId]
    );
    
    return rows || [];
  } catch (error) {
    console.error('Erro ao buscar boletos do cliente:', error);
    return [];
  }
}

/**
 * Lista os boletos disponíveis para o cliente
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão
 * @param {Function} sendText - Função para enviar mensagens
 * @returns {Promise<void>}
 */
async function listInvoices(jid, sess, sendText) {
  try {
    console.log(`Listando boletos para ${jid}`);
    
    // Obter o cliente
    const phone = jid.split('@')[0];
    const user = await db.getOrCreateUser(phone);
    
    if (!user || !user.id) {
      await sendText(jid, 'Desculpe, não foi possível identificar seu cadastro. Por favor, entre em contato com nosso suporte.');
      return;
    }
    
    // Buscar boletos do cliente
    const invoices = await getClientInvoices(user.id);
    
    if (!invoices || invoices.length === 0) {
      await sendText(jid, await db.getCustomText('no_invoices') || 
                   'Não encontramos boletos pendentes para seu cadastro. Se precisar de ajuda, selecione a opção de falar com um atendente.');
      return;
    }
    
    // Formatar a lista de boletos
    let message = await db.getCustomText('invoices_list_header') || 
                'Encontramos os seguintes boletos para seu cadastro:\n\n';
    
    invoices.forEach((invoice, index) => {
      // Formatar data de vencimento
      const dueDate = new Date(invoice.due_date);
      const formattedDate = dueDate.toLocaleDateString('pt-BR');
      
      // Status de pagamento
      const status = invoice.paid ? '✅ PAGO' : '⏳ PENDENTE';
      
      message += `*${index + 1}.* Vencimento: ${formattedDate}\n` +
                `   Valor: R$ ${invoice.amount.toFixed(2)}\n` +
                `   Status: ${status}\n` +
                `   Ref: ${invoice.reference || 'N/A'}\n\n`;
    });
    
    message += 'Para receber a 2ª via de um boleto, digite o número correspondente:';
    
    // Enviar a mensagem com a lista
    await sendText(jid, message);
    
    // Atualizar o estado da sessão para aguardar a escolha
    sess.state = 'invoice_selection';
    sess.data = sess.data || {};
    sess.data.invoices = invoices;
    
    await db.updateSession(sess.sessionId, {
      menu: sess.state,
      current_menu: sess.state
    });
    
  } catch (error) {
    console.error('Erro ao listar boletos:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao recuperar seus boletos. Por favor, tente novamente ou contate nosso suporte.');
  }
}

/**
 * Processa a seleção de boleto e envia a 2ª via
 * @param {String} jid - ID do WhatsApp do cliente
 * @param {Object} sess - Objeto de sessão
 * @param {String} text - Texto com a seleção
 * @param {Function} sendText - Função para enviar mensagens
 * @param {Function} sendDocument - Função para enviar documentos
 * @returns {Promise<void>}
 */
async function handleInvoiceSelection(jid, sess, text, sendText, sendDocument) {
  try {
    const selection = parseInt(text.trim());
    
    // Verificar se a seleção é válida
    if (isNaN(selection) || selection < 1 || selection > (sess.data?.invoices?.length || 0)) {
      await sendText(jid, 'Por favor, selecione um número válido da lista de boletos apresentada.');
      return;
    }
    
    // Obter o boleto selecionado (ajustar índice)
    const selectedInvoice = sess.data.invoices[selection - 1];
    
    // Verificar se o boleto está pago
    if (selectedInvoice.paid) {
      await sendText(jid, 'Este boleto já consta como PAGO em nosso sistema. Caso necessite do comprovante, por favor, contate nosso suporte.');
      return;
    }
    
    // Buscar caminho do arquivo PDF do boleto
    const boleto_path = selectedInvoice.pdf_path || await findInvoicePdfPath(selectedInvoice.id);
    
    if (!boleto_path || !(await fileExists(boleto_path))) {
      await sendText(jid, 'Não foi possível localizar o arquivo do boleto. Por favor, selecione a opção de falar com um atendente para obter ajuda.');
      return;
    }
    
    // Enviar mensagem informando o envio
    await sendText(jid, await db.getCustomText('sending_invoice') || 
                 'Estamos enviando a 2ª via do boleto selecionado. Por favor, aguarde um momento...');
    
    // Formatar o nome do arquivo para melhor visualização
    const fileName = `Boleto_${new Date(selectedInvoice.due_date).toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
    
    // Enviar o documento
    await sendDocument(jid, boleto_path, fileName, 'Boleto para pagamento');
    
    // Registrar que o boleto foi enviado
    await db.saveMessage(sess.userId, 'outgoing', `[BOLETO] Enviada 2ª via do boleto ID: ${selectedInvoice.id}`);
    
    // Enviar mensagem final
    await sendText(jid, await db.getCustomText('invoice_sent') || 
                 'Seu boleto foi enviado com sucesso. Caso tenha alguma dúvida, selecione a opção de falar com um atendente.');
    
    // Voltar ao menu financeiro
    sess.state = 'menu_financial';
    await db.updateSession(sess.sessionId, {
      menu: sess.state,
      current_menu: sess.state
    });
    
    // Exibir novamente o menu financeiro
    setTimeout(async () => {
      await sendText(jid, formatMenu('financial'));
    }, 2000);
    
  } catch (error) {
    console.error('Erro ao processar seleção de boleto:', error);
    await sendText(jid, 'Desculpe, tivemos um problema ao processar sua solicitação. Por favor, tente novamente ou contate nosso suporte.');
  }
}

/**
 * Busca o caminho do arquivo PDF de um boleto
 * @param {Number} invoiceId - ID do boleto
 * @returns {Promise<String|null>} - Caminho do arquivo ou null
 */
async function findInvoicePdfPath(invoiceId) {
  try {
    // Consulta ao banco de dados para encontrar o caminho do arquivo
    const [rows] = await db.pool.execute(
      'SELECT pdf_path FROM invoices WHERE id = ? LIMIT 1',
      [invoiceId]
    );
    
    if (rows && rows[0] && rows[0].pdf_path) {
      return rows[0].pdf_path;
    }
    
    // Alternativa: tentar localizar o arquivo por convenção de nomenclatura
    const invoiceDir = await db.getConfig('invoices_directory') || './invoices';
    const filePath = path.join(invoiceDir, `boleto_${invoiceId}.pdf`);
    
    if (await fileExists(filePath)) {
      return filePath;
    }
    
    return null;
  } catch (error) {
    console.error('Erro ao buscar caminho do PDF do boleto:', error);
    return null;
  }
}

// Exportar funções
module.exports = {
  sendPixKey,
  listInvoices,
  handleInvoiceSelection
};