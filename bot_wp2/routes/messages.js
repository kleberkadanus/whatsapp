/**
 * Rotas para gerenciamento de mensagens do bot
 * Funcionalidades:
 * - Listar todas as mensagens configuráveis do sistema
 * - Buscar mensagem por tipo ou ID
 * - Atualizar mensagens de boas-vindas, despedidas, etc.
 * - Gerenciar templates de mensagens
 * - Configurar mensagens automáticas (lembretes, pós-venda)
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const db = require('../backend/database');

// Obter todas as mensagens do sistema
router.get('/', verifyToken, async (req, res) => {
  try {
    const [messages] = await db.promise().query(
      `SELECT * FROM system_messages ORDER BY type ASC`
    );
    res.json(messages);
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

// Obter mensagens por tipo
router.get('/type/:type', verifyToken, async (req, res) => {
  try {
    const { type } = req.params;
    const [messages] = await db.promise().query(
      `SELECT * FROM system_messages WHERE type = ?`,
      [type]
    );
    
    if (messages.length === 0) {
      return res.status(404).json({ error: 'Nenhuma mensagem encontrada com este tipo' });
    }
    
    res.json(messages);
  } catch (error) {
    console.error('Erro ao buscar mensagens por tipo:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens por tipo' });
  }
});

// Obter uma mensagem específica por ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [messages] = await db.promise().query(
      `SELECT * FROM system_messages WHERE id = ?`,
      [id]
    );
    
    if (messages.length === 0) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }
    
    res.json(messages[0]);
  } catch (error) {
    console.error('Erro ao buscar mensagem:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagem' });
  }
});

// Atualizar uma mensagem
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, is_active, additional_data } = req.body;
    
    // Verificar se a mensagem existe
    const [existingMessage] = await db.promise().query(
      'SELECT id FROM system_messages WHERE id = ?',
      [id]
    );
    
    if (existingMessage.length === 0) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }
    
    // Atualizar a mensagem
    await db.promise().query(
      `UPDATE system_messages SET 
       content = ?, 
       is_active = ?,
       additional_data = ?,
       updated_at = NOW()
       WHERE id = ?`,
      [content, is_active, JSON.stringify(additional_data || {}), id]
    );
    
    // Buscar a mensagem atualizada
    const [updatedMessage] = await db.promise().query(
      `SELECT * FROM system_messages WHERE id = ?`,
      [id]
    );
    
    res.json(updatedMessage[0]);
  } catch (error) {
    console.error('Erro ao atualizar mensagem:', error);
    res.status(500).json({ error: 'Erro ao atualizar mensagem' });
  }
});

// Criar uma nova mensagem
router.post('/', verifyToken, async (req, res) => {
  try {
    const { type, name, content, is_active, additional_data } = req.body;
    
    // Validar dados
    if (!type || !name || !content) {
      return res.status(400).json({ error: 'Tipo, nome e conteúdo são obrigatórios' });
    }
    
    // Inserir a nova mensagem
    const [result] = await db.promise().query(
      `INSERT INTO system_messages 
       (type, name, content, is_active, additional_data, created_at) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [type, name, content, is_active || 1, JSON.stringify(additional_data || {})]
    );
    
    const newMessageId = result.insertId;
    
    // Buscar a mensagem recém-criada
    const [newMessage] = await db.promise().query(
      `SELECT * FROM system_messages WHERE id = ?`,
      [newMessageId]
    );
    
    res.status(201).json(newMessage[0]);
  } catch (error) {
    console.error('Erro ao criar mensagem:', error);
    res.status(500).json({ error: 'Erro ao criar mensagem' });
  }
});

// Excluir uma mensagem
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar se a mensagem existe
    const [existingMessage] = await db.promise().query(
      'SELECT id, type FROM system_messages WHERE id = ?',
      [id]
    );
    
    if (existingMessage.length === 0) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }
    
    // Verificar se é uma mensagem do sistema (que não pode ser excluída)
    const systemMessageTypes = ['welcome', 'goodbye', 'error', 'menu_prefix', 'menu_suffix'];
    if (systemMessageTypes.includes(existingMessage[0].type)) {
      return res.status(403).json({ 
        error: 'Mensagens do sistema não podem ser excluídas. Apenas atualizadas.' 
      });
    }
    
    // Excluir a mensagem
    await db.promise().query('DELETE FROM system_messages WHERE id = ?', [id]);
    
    res.json({ message: 'Mensagem excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir mensagem:', error);
    res.status(500).json({ error: 'Erro ao excluir mensagem' });
  }
});

// Obter mensagens de boas-vindas
router.get('/welcome/all', verifyToken, async (req, res) => {
  try {
    const [messages] = await db.promise().query(
      `SELECT * FROM system_messages WHERE type = 'welcome' ORDER BY id ASC`
    );
    res.json(messages);
  } catch (error) {
    console.error('Erro ao buscar mensagens de boas-vindas:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens de boas-vindas' });
  }
});

// Obter mensagens de despedida
router.get('/goodbye/all', verifyToken, async (req, res) => {
  try {
    const [messages] = await db.promise().query(
      `SELECT * FROM system_messages WHERE type = 'goodbye' ORDER BY id ASC`
    );
    res.json(messages);
  } catch (error) {
    console.error('Erro ao buscar mensagens de despedida:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens de despedida' });
  }
});

// Obter mensagens de erro
router.get('/error/all', verifyToken, async (req, res) => {
  try {
    const [messages] = await db.promise().query(
      `SELECT * FROM system_messages WHERE type = 'error' ORDER BY id ASC`
    );
    res.json(messages);
  } catch (error) {
    console.error('Erro ao buscar mensagens de erro:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens de erro' });
  }
});

// Obter mensagens de pós-venda
router.get('/postsale/all', verifyToken, async (req, res) => {
  try {
    const [messages] = await db.promise().query(
      `SELECT * FROM system_messages WHERE type = 'postsale' ORDER BY id ASC`
    );
    res.json(messages);
  } catch (error) {
    console.error('Erro ao buscar mensagens de pós-venda:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens de pós-venda' });
  }
});

// Obter mensagens de agendamento
router.get('/scheduling/all', verifyToken, async (req, res) => {
  try {
    const [messages] = await db.promise().query(
      `SELECT * FROM system_messages WHERE type = 'scheduling' ORDER BY id ASC`
    );
    res.json(messages);
  } catch (error) {
    console.error('Erro ao buscar mensagens de agendamento:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens de agendamento' });
  }
});

// Buscar mensagens para o WhatsApp (usado pelo backend)
router.get('/whatsapp/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const [messages] = await db.promise().query(
      `SELECT * FROM system_messages WHERE type = ? AND is_active = 1`,
      [type]
    );
    
    // Formatar respostas para o bot
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      name: msg.name,
      content: msg.content,
      additionalData: JSON.parse(msg.additional_data || '{}')
    }));
    
    res.json(formattedMessages);
  } catch (error) {
    console.error('Erro ao buscar mensagens para WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

// Obter mensagens com regras de substituição
router.get('/templates/variables', verifyToken, async (req, res) => {
  try {
    // Retornar todas as variáveis disponíveis para substituição em templates
    const variables = [
      { variable: '{cliente_nome}', description: 'Nome do cliente' },
      { variable: '{cliente_telefone}', description: 'Telefone do cliente' },
      { variable: '{cliente_email}', description: 'Email do cliente' },
      { variable: '{cliente_endereco}', description: 'Endereço do cliente' },
      { variable: '{agenda_data}', description: 'Data da visita agendada' },
      { variable: '{agenda_hora}', description: 'Hora da visita agendada' },
      { variable: '{tecnico_nome}', description: 'Nome do técnico' },
      { variable: '{boleto_valor}', description: 'Valor do boleto' },
      { variable: '{boleto_vencimento}', description: 'Data de vencimento do boleto' },
      { variable: '{menu_anterior}', description: 'Última opção de menu selecionada' },
      { variable: '{pix_chave}', description: 'Chave PIX da empresa' },
      { variable: '{empresa_nome}', description: 'Nome da empresa' }
    ];
    
    res.json(variables);
  } catch (error) {
    console.error('Erro ao buscar variáveis de template:', error);
    res.status(500).json({ error: 'Erro ao buscar variáveis de template' });
  }
});

// Criação em massa de mensagens padrão (para inicialização do sistema)
router.post('/system/initialize', verifyToken, async (req, res) => {
  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Verificar se já existem mensagens no sistema
    const [existingMessages] = await connection.query('SELECT COUNT(*) as count FROM system_messages');
    
    if (existingMessages[0].count > 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Sistema já inicializado com mensagens padrão' });
    }
    
    // Mensagens padrão do sistema
    const defaultMessages = [
      {
        type: 'welcome',
        name: 'Primeira interação',
        content: 'Olá! Bem-vindo(a) ao nosso atendimento. Para continuarmos, precisamos de algumas informações para cadastro. Poderia me informar seu nome completo?',
        is_active: 1,
        additional_data: '{}'
      },
      {
        type: 'welcome',
        name: 'Retorno de cliente',
        content: 'Olá {cliente_nome}, bem-vindo(a) de volta! Seu último atendimento foi sobre {menu_anterior}. Deseja continuar com o mesmo assunto ou iniciar uma nova solicitação?',
        is_active: 1,
        additional_data: '{}'
      },
      {
        type: 'goodbye',
        name: 'Finalização padrão',
        content: 'Obrigado por entrar em contato conosco. Esperamos ter ajudado. Tenha um ótimo dia!',
        is_active: 1,
        additional_data: '{}'
      },
      {
        type: 'error',
        name: 'Opção inválida',
        content: 'Desculpe, não entendi sua opção. Por favor, escolha uma das opções disponíveis no menu.',
        is_active: 1,
        additional_data: '{}'
      },
      {
        type: 'error',
        name: 'Tempo esgotado',
        content: 'Parece que nosso atendimento ficou inativo por muito tempo. Se precisar de ajuda, por favor, entre em contato novamente.',
        is_active: 1,
        additional_data: '{}'
      },
      {
        type: 'menu_prefix',
        name: 'Prefixo de menu',
        content: 'Por favor, escolha uma das opções abaixo:',
        is_active: 1,
        additional_data: '{}'
      },
      {
        type: 'menu_suffix',
        name: 'Sufixo de menu',
        content: 'Digite o número da opção desejada.',
        is_active: 1,
        additional_data: '{}'
      },
      {
        type: 'scheduling',
        name: 'Agendamento confirmado',
        content: 'Sua visita técnica foi agendada para o dia {agenda_data} às {agenda_hora}. Enviaremos um lembrete próximo à data.',
        is_active: 1,
        additional_data: '{}'
      },
      {
        type: 'scheduling',
        name: 'Lembrete de agendamento',
        content: 'Lembrete: Você tem uma visita técnica agendada para hoje às {agenda_hora}. Por favor, confirme se podemos manter o agendamento.',
        is_active: 1,
        additional_data: '{}'
      },
      {
        type: 'postsale',
        name: 'Pesquisa pós-venda',
        content: 'Olá {cliente_nome}, vimos que o técnico finalizou sua instalação/manutenção. Gostaríamos de saber como foi sua experiência conosco!',
        is_active: 1,
        additional_data: '{}'
      },
      {
        type: 'postsale',
        name: 'Pergunta de recomendação',
        content: 'Última pergunta, qual a chance de nos recomendar para um amigo ou familiar?',
        is_active: 1,
        additional_data: '{}'
      },
      {
        type: 'lgpd',
        name: 'Termos LGPD',
        content: 'Seus dados estão protegidos de acordo com a Lei Geral de Proteção de Dados. Para continuar, precisamos que você aceite nossos termos de uso.',
        is_active: 1,
        additional_data: '{}'
      }
    ];
    
    // Inserir mensagens padrão
    for (const message of defaultMessages) {
      await connection.query(
        `INSERT INTO system_messages 
         (type, name, content, is_active, additional_data, created_at) 
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          message.type, 
          message.name, 
          message.content, 
          message.is_active, 
          message.additional_data
        ]
      );
    }
    
    await connection.commit();
    res.status(201).json({ message: 'Mensagens padrão inicializadas com sucesso' });
  } catch (error) {
    await connection.rollback();
    console.error('Erro ao inicializar mensagens padrão:', error);
    res.status(500).json({ error: 'Erro ao inicializar mensagens padrão' });
  } finally {
    connection.release();
  }
});

// Buscar mensagens por palavras-chave
router.get('/search/:query', verifyToken, async (req, res) => {
  try {
    const { query } = req.params;
    const [messages] = await db.promise().query(
      `SELECT * FROM system_messages 
       WHERE content LIKE ? OR name LIKE ? OR type LIKE ?
       ORDER BY type ASC, name ASC`,
      [`%${query}%`, `%${query}%`, `%${query}%`]
    );
    
    res.json(messages);
  } catch (error) {
    console.error('Erro ao buscar mensagens por palavras-chave:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens por palavras-chave' });
  }
});

module.exports = router;