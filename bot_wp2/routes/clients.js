/**
 * clients.js - Rotas para gerenciamento de clientes
 * 
 * Este arquivo define as rotas da API para operações relacionadas aos
 * clientes, como listagem, criação, atualização, mensagens e outras
 * funcionalidades relacionadas.
 */

const express = require('express');
const router = express.Router();
const db = require('../backend/database');
const { verifyToken } = require('./auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config/app.config');

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, config.files.uploadsDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'client-' + uniqueSuffix + ext);
  }
});

// Filtro para tipos de arquivo permitidos
const fileFilter = (req, file, cb) => {
  if (config.files.allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não permitido'), false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: config.files.maxFileSize
  },
  fileFilter: fileFilter
});

/**
 * @route GET /api/clients
 * @desc Listar clientes com paginação e filtros
 * @access Privado
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    // Parâmetros de paginação
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Parâmetros de filtro
    const filters = {};
    
    if (req.query.search) {
      filters.$or = [
        { name: { $like: `%${req.query.search}%` } },
        { phone: { $like: `%${req.query.search}%` } },
        { email: { $like: `%${req.query.search}%` } }
      ];
    }
    
    if (req.query.dateFrom) {
      filters.created_at = { ...filters.created_at, $gte: new Date(req.query.dateFrom) };
    }
    
    if (req.query.dateTo) {
      filters.created_at = { ...filters.created_at, $lte: new Date(req.query.dateTo) };
    }
    
    if (req.query.status) {
      if (req.query.status === 'active') {
        filters.blocked = false;
      } else if (req.query.status === 'blocked') {
        filters.blocked = true;
      }
    }
    
    if (req.query.interaction) {
      // Filtro para clientes com determinado tipo de interação
      // Este filtro seria implementado com uma consulta de junção
      // Para simplificar, vamos apenas realizar a consulta básica
    }
    
    // Contar total de registros
    const totalClients = await db.count('clients', filters);
    
    // Buscar clientes com paginação
    let query = `
      SELECT c.*, 
             COUNT(m.id) as messages_count,
             MAX(m.created_at) as last_activity,
             CASE WHEN s.id IS NOT NULL THEN true ELSE false END as active_session
      FROM clients c
      LEFT JOIN messages m ON c.id = m.client_id
      LEFT JOIN sessions s ON c.id = s.client_id AND s.active = true
    `;
    
    // Adicionar condições de filtro
    if (Object.keys(filters).length > 0) {
      // Na prática, seria necessário construir a cláusula WHERE com base nos filtros
      // Simplificando para este exemplo
      query += ` WHERE c.id > 0`;
    }
    
    query += `
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ${offset}, ${limit}
    `;
    
    const clients = await db.search(query);
    
    return res.status(200).json({
      success: true,
      total: totalClients,
      page,
      limit,
      clients
    });
  } catch (error) {
    console.error('Erro ao listar clientes:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar clientes'
    });
  }
});

/**
 * @route GET /api/clients/:id
 * @desc Obter detalhes de um cliente específico
 * @access Privado
 */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    
    // Buscar cliente
    const client = await db.findOne('clients', { id: clientId });
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }
    
    // Buscar estatísticas do cliente
    const query = `
      SELECT 
        COUNT(DISTINCT m.id) as messages_count,
        COUNT(DISTINCT s.id) as sessions_count,
        COUNT(DISTINCT a.id) as schedules_count,
        COUNT(DISTINCT i.id) as invoices_count,
        MAX(m.created_at) as last_activity,
        AVG(r.rating_score) as avg_rating
      FROM clients c
      LEFT JOIN messages m ON c.id = m.client_id
      LEFT JOIN sessions s ON c.id = s.client_id
      LEFT JOIN appointments a ON c.id = a.client_id
      LEFT JOIN invoices i ON c.id = i.client_id
      LEFT JOIN ratings r ON c.id = r.client_id
      WHERE c.id = ?
    `;
    
    const stats = await db.query(query, [clientId]);
    
    return res.status(200).json({
      success: true,
      client,
      stats: stats[0]
    });
  } catch (error) {
    console.error(`Erro ao buscar cliente ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar cliente'
    });
  }
});

/**
 * @route POST /api/clients
 * @desc Criar novo cliente
 * @access Privado
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, phone, email, address, complement, blocked } = req.body;
    
    // Validar telefone (obrigatório)
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'O telefone é obrigatório'
      });
    }
    
    // Verificar se cliente já existe com o mesmo telefone
    const existingClient = await db.findOne('clients', { phone });
    
    if (existingClient) {
      return res.status(409).json({
        success: false,
        message: 'Já existe um cliente cadastrado com este telefone'
      });
    }
    
    // Criar cliente
    const newClient = {
      name: name || null,
      phone,
      email: email || null,
      address: address || null,
      complement: complement || null,
      blocked: blocked || false,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    const result = await db.insert('clients', newClient);
    
    if (!result || !result.id) {
      throw new Error('Falha ao inserir cliente no banco de dados');
    }
    
    // Buscar cliente criado
    const client = await db.findOne('clients', { id: result.id });
    
    // Registrar ação
    await db.insert('logs', {
      user_id: req.user.id,
      action: 'create_client',
      entity_id: client.id,
      created_at: new Date()
    });
    
    return res.status(201).json({
      success: true,
      message: 'Cliente criado com sucesso',
      client
    });
  } catch (error) {
    console.error('Erro ao criar cliente:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao criar cliente'
    });
  }
});

/**
 * @route PUT /api/clients/:id
 * @desc Atualizar cliente existente
 * @access Privado
 */
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    const { name, email, address, complement, blocked } = req.body;
    
    // Verificar se cliente existe
    const client = await db.findOne('clients', { id: clientId });
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }
    
    // Não permitir alterar o telefone, que é o identificador principal
    
    // Preparar dados para atualização
    const updateData = {
      name: name || client.name,
      email: email || client.email,
      address: address || client.address,
      complement: complement || client.complement,
      blocked: typeof blocked !== 'undefined' ? blocked : client.blocked,
      updated_at: new Date()
    };
    
    // Atualizar cliente
    await db.update('clients', updateData, { id: clientId });
    
    // Buscar cliente atualizado
    const updatedClient = await db.findOne('clients', { id: clientId });
    
    // Registrar ação
    await db.insert('logs', {
      user_id: req.user.id,
      action: 'update_client',
      entity_id: clientId,
      created_at: new Date()
    });
    
    return res.status(200).json({
      success: true,
      message: 'Cliente atualizado com sucesso',
      client: updatedClient
    });
  } catch (error) {
    console.error(`Erro ao atualizar cliente ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar cliente'
    });
  }
});

/**
 * @route DELETE /api/clients/:id
 * @desc Remover cliente
 * @access Privado (apenas admin)
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    // Verificar permissão (apenas admin pode remover clientes)
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Permissão negada'
      });
    }
    
    const clientId = req.params.id;
    
    // Verificar se cliente existe
    const client = await db.findOne('clients', { id: clientId });
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }
    
    // Em vez de excluir fisicamente, marcar como excluído (soft delete)
    await db.update('clients', 
      { 
        deleted: true,
        deleted_at: new Date(),
        updated_at: new Date()
      }, 
      { id: clientId }
    );
    
    // Registrar ação
    await db.insert('logs', {
      user_id: req.user.id,
      action: 'delete_client',
      entity_id: clientId,
      created_at: new Date()
    });
    
    return res.status(200).json({
      success: true,
      message: 'Cliente removido com sucesso'
    });
  } catch (error) {
    console.error(`Erro ao remover cliente ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao remover cliente'
    });
  }
});

/**
 * @route GET /api/clients/:id/messages
 * @desc Obter histórico de mensagens de um cliente
 * @access Privado
 */
router.get('/:id/messages', verifyToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    
    // Verificar se cliente existe
    const client = await db.findOne('clients', { id: clientId });
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }
    
    // Buscar mensagens
    const messages = await db.find('messages', 
      { client_id: clientId },
      'created_at',
      'ASC'
    );
    
    return res.status(200).json({
      success: true,
      messages
    });
  } catch (error) {
    console.error(`Erro ao buscar mensagens do cliente ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar mensagens'
    });
  }
});

/**
 * @route POST /api/clients/:id/messages
 * @desc Enviar mensagem para um cliente
 * @access Privado
 */
router.post('/:id/messages', verifyToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    const { message } = req.body;
    
    // Validar mensagem
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Conteúdo da mensagem é obrigatório'
      });
    }
    
    // Verificar se cliente existe
    const client = await db.findOne('clients', { id: clientId });
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }
    
    // Criar mensagem
    const newMessage = {
      client_id: clientId,
      user_id: req.user.id,
      message_text: message,
      direction: 'outgoing',
      status: 'pending',
      created_at: new Date()
    };
    
    const result = await db.insert('messages', newMessage);
    
    // TODO: Integrar com o serviço de WhatsApp para envio da mensagem
    // Isso seria implementado em outro módulo específico
    
    // Atualizar status da mensagem para 'sent'
    await db.update('messages', 
      { status: 'sent', sent_at: new Date() },
      { id: result.id }
    );
    
    // Buscar mensagem com dados atualizados
    const sentMessage = await db.findOne('messages', { id: result.id });
    
    return res.status(201).json({
      success: true,
      message: 'Mensagem enviada com sucesso',
      data: sentMessage
    });
  } catch (error) {
    console.error(`Erro ao enviar mensagem para cliente ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao enviar mensagem'
    });
  }
});

/**
 * @route POST /api/clients/:id/start-chat
 * @desc Iniciar conversa com cliente
 * @access Privado
 */
router.post('/:id/start-chat', verifyToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    
    // Verificar se cliente existe
    const client = await db.findOne('clients', { id: clientId });
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }
    
    // Verificar se já existe uma sessão ativa
    const activeSession = await db.findOne('sessions', { 
      client_id: clientId,
      active: true
    });
    
    if (activeSession) {
      // Atualizar sessão existente
      await db.update('sessions', 
        { 
          user_id: req.user.id,
          updated_at: new Date()
        },
        { id: activeSession.id }
      );
    } else {
      // Criar nova sessão
      await db.insert('sessions', {
        client_id: clientId,
        user_id: req.user.id,
        active: true,
        created_at: new Date(),
        updated_at: new Date()
      });
      
      // Buscar a mensagem de boas-vindas nas configurações
      const welcomeMessage = await db.findOne('settings', { key: 'welcome_message' });
      
      if (welcomeMessage && welcomeMessage.value) {
        // Enviar mensagem de boas-vindas
        await db.insert('messages', {
          client_id: clientId,
          user_id: req.user.id,
          message_text: welcomeMessage.value,
          direction: 'outgoing',
          status: 'pending',
          created_at: new Date()
        });
        
        // TODO: Integrar com o serviço de WhatsApp para envio da mensagem
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Chat iniciado com sucesso'
    });
  } catch (error) {
    console.error(`Erro ao iniciar chat com cliente ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao iniciar chat'
    });
  }
});

/**
 * @route GET /api/clients/:id/invoices
 * @desc Listar boletos de um cliente
 * @access Privado
 */
router.get('/:id/invoices', verifyToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    
    // Verificar se cliente existe
    const client = await db.findOne('clients', { id: clientId });
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }
    
    // Buscar boletos
    const invoices = await db.find('invoices', 
      { client_id: clientId, deleted: false },
      'due_date',
      'DESC'
    );
    
    return res.status(200).json({
      success: true,
      invoices
    });
  } catch (error) {
    console.error(`Erro ao buscar boletos do cliente ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar boletos'
    });
  }
});

/**
 * @route POST /api/clients/:id/invoices
 * @desc Criar boleto para um cliente
 * @access Privado
 */
router.post('/:id/invoices', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const clientId = req.params.id;
    const { reference, amount, due_date, paid } = req.body;
    
    // Validar dados obrigatórios
    if (!amount || !due_date) {
      return res.status(400).json({
        success: false,
        message: 'Valor e data de vencimento são obrigatórios'
      });
    }
    
    // Verificar se cliente existe
    const client = await db.findOne('clients', { id: clientId });
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }
    
    // Preparar dados do boleto
    const newInvoice = {
      client_id: clientId,
      user_id: req.user.id,
      reference: reference || null,
      amount: parseFloat(amount),
      due_date: new Date(due_date),
      paid: paid === 'true' || paid === true,
      file_path: req.file ? req.file.path : null,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    // Inserir boleto
    const result = await db.insert('invoices', newInvoice);
    
    // Buscar boleto criado
    const invoice = await db.findOne('invoices', { id: result.id });
    
    // Se não marcado como pago, enviar notificação de boleto
    if (!invoice.paid) {
      // TODO: Integrar com o serviço de WhatsApp para envio da notificação
    }
    
    return res.status(201).json({
      success: true,
      message: 'Boleto criado com sucesso',
      invoice
    });
  } catch (error) {
    console.error(`Erro ao criar boleto para cliente ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao criar boleto'
    });
  }
});

/**
 * @route GET /api/clients/:id/invoices/:invoiceId
 * @desc Obter detalhes de um boleto específico
 * @access Privado
 */
router.get('/:id/invoices/:invoiceId', verifyToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    const invoiceId = req.params.invoiceId;
    
    // Verificar se cliente existe
    const client = await db.findOne('clients', { id: clientId });
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }
    
    // Buscar boleto
    const invoice = await db.findOne('invoices', { 
      id: invoiceId,
      client_id: clientId,
      deleted: false
    });
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Boleto não encontrado'
      });
    }
    
    return res.status(200).json({
      success: true,
      invoice
    });
  } catch (error) {
    console.error(`Erro ao buscar boleto ${req.params.invoiceId} do cliente ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar boleto'
    });
  }
});

/**
 * @route PUT /api/clients/:id/invoices/:invoiceId
 * @desc Atualizar boleto
 * @access Privado
 */
router.put('/:id/invoices/:invoiceId', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const clientId = req.params.id;
    const invoiceId = req.params.invoiceId;
    const { reference, amount, due_date, paid } = req.body;
    
    // Validar dados obrigatórios
    if (!amount || !due_date) {
      return res.status(400).json({
        success: false,
        message: 'Valor e data de vencimento são obrigatórios'
      });
    }
    
    // Verificar se cliente existe
    const client = await db.findOne('clients', { id: clientId });
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }
    
    // Buscar boleto
    const invoice = await db.findOne('invoices', { 
      id: invoiceId,
      client_id: clientId,
      deleted: false
    });
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Boleto não encontrado'
      });
    }
    
    // Preparar dados para atualização
    const updateData = {
      reference: reference || invoice.reference,
      amount: parseFloat(amount),
      due_date: new Date(due_date),
      updated_at: new Date()
    };
    
    // Verificar se o status de pagamento foi alterado
    const wasPaid = invoice.paid;
    const isPaid = paid === 'true' || paid === true;
    
    updateData.paid = isPaid;
    
    if (!wasPaid && isPaid) {
      updateData.paid_at = new Date();
    }
    
    // Verificar se foi enviado um novo arquivo
    if (req.file) {
      // Se já existia um arquivo, excluir o antigo
      if (invoice.file_path && fs.existsSync(invoice.file_path)) {
        fs.unlinkSync(invoice.file_path);
      }
      
      updateData.file_path = req.file.path;
    }
    
    // Atualizar boleto
    await db.update('invoices', updateData, { id: invoiceId });
    
    // Buscar boleto atualizado
    const updatedInvoice = await db.findOne('invoices', { id: invoiceId });
    
    // Se o status mudou para pago, enviar confirmação
    if (!wasPaid && isPaid) {
      // TODO: Integrar com o serviço de WhatsApp para envio da confirmação
    }
    
    return res.status(200).json({
      success: true,
      message: 'Boleto atualizado com sucesso',
      invoice: updatedInvoice
    });
  } catch (error) {
    console.error(`Erro ao atualizar boleto ${req.params.invoiceId} do cliente ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar boleto'
    });
  }
});

/**
 * @route DELETE /api/clients/:id/invoices/:invoiceId
 * @desc Excluir boleto
 * @access Privado
 */
router.delete('/:id/invoices/:invoiceId', verifyToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    const invoiceId = req.params.invoiceId;
    
    // Verificar se cliente existe
    const client = await db.findOne('clients', { id: clientId });
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }
    
    // Buscar boleto
    const invoice = await db.findOne('invoices', { 
      id: invoiceId,
      client_id: clientId,
      deleted: false
    });
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Boleto não encontrado'
      });
    }
    
    // Marcar como excluído (soft delete)
    await db.update('invoices', 
      { 
        deleted: true,
        deleted_at: new Date(),
        updated_at: new Date()
      }, 
      { id: invoiceId }
    );
    
    return res.status(200).json({
      success: true,
      message: 'Boleto excluído com sucesso'
    });
  } catch (error) {
    console.error(`Erro ao excluir boleto ${req.params.invoiceId} do cliente ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao excluir boleto'
    });
  }
});

/**
 * @route GET /api/clients/:id/invoices/:invoiceId/pdf
 * @desc Obter PDF de um boleto
 * @access Privado
 */
router.get('/:id/invoices/:invoiceId/pdf', verifyToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    const invoiceId = req.params.invoiceId;
    
    // Verificar se cliente existe
    const client = await db.findOne('clients', { id: clientId });
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }
    
    // Buscar boleto
    const invoice = await db.findOne('invoices', { 
      id: invoiceId,
      client_id: clientId,
      deleted: false
    });
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Boleto não encontrado'
      });
    }
    
    // Verificar se o boleto tem arquivo
    if (!invoice.file_path || !fs.existsSync(invoice.file_path)) {
      return res.status(404).json({
        success: false,
        message: 'Arquivo do boleto não encontrado'
      });
    }
    
    // Enviar arquivo
    res.sendFile(path.resolve(invoice.file_path));
  } catch (error) {
    console.error(`Erro ao obter PDF do boleto ${req.params.invoiceId} do cliente ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao obter PDF do boleto'
    });
  }
});

/**
 * @route GET /api/clients/:id/schedules
 * @desc Listar agendamentos de um cliente
 * @access Privado
 */
router.get('/:id/schedules', verifyToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    
    // Verificar se cliente existe
    const client = await db.findOne('clients', { id: clientId });
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }
    
    // Buscar agendamentos
    const schedules = await db.find('appointments', 
      { client_id: clientId },
      'appointment_date',
      'DESC'
    );
    
    return res.status(200).json({
      success: true,
      schedules
    });
  } catch (error) {
    console.error(`Erro ao buscar agendamentos do cliente ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar agendamentos'
    });
  }
});

/**
 * @route POST /api/clients/:id/schedules/:scheduleId/complete
 * @desc Marcar agendamento como concluído
 * @access Privado
 */
router.post('/:id/schedules/:scheduleId/complete', verifyToken, async (req, res) => {
    try {
      const clientId = req.params.id;
      const scheduleId = req.params.scheduleId;
      
      // Verificar se cliente existe
      const client = await db.findOne('clients', { id: clientId });
      
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado'
        });
      }
      
      // Buscar agendamento
      const schedule = await db.findOne('appointments', { 
        id: scheduleId,
        client_id: clientId
      });
      
      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: 'Agendamento não encontrado'
        });
      }
      
      // Verificar se já está concluído
      if (schedule.status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Agendamento já está concluído'
        });
      }
      
      // Atualizar status
      await db.update('appointments', 
        { 
          status: 'completed',
          completed_at: new Date(),
          completed_by: req.user.id,
          updated_at: new Date()
        }, 
        { id: scheduleId }
      );
      
      // Buscar agendamento atualizado
      const updatedSchedule = await db.findOne('appointments', { id: scheduleId });
      
      // Agendar pesquisa de satisfação para alguns dias depois
      const postsaleWaitDays = await db.findOne('settings', { key: 'postsale_wait_days' });
      const waitDays = postsaleWaitDays && postsaleWaitDays.value 
        ? parseInt(postsaleWaitDays.value) 
        : 1;
      
      const surveyDate = new Date();
      surveyDate.setDate(surveyDate.getDate() + waitDays);
      
      await db.insert('scheduled_tasks', {
        type: 'postsale_survey',
        entity_type: 'appointment',
        entity_id: scheduleId,
        scheduled_for: surveyDate,
        data: JSON.stringify({
          client_id: clientId,
          service_type: schedule.service_type
        }),
        created_at: new Date()
      });
      
      return res.status(200).json({
        success: true,
        message: 'Agendamento concluído com sucesso',
        schedule: updatedSchedule
      });
    } catch (error) {
      console.error(`Erro ao concluir agendamento ${req.params.scheduleId} do cliente ${req.params.id}:`, error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao concluir agendamento'
      });
    }
  });
  
  /**
   * @route POST /api/clients/:id/schedules/:scheduleId/cancel
   * @desc Cancelar agendamento
   * @access Privado
   */
  router.post('/:id/schedules/:scheduleId/cancel', verifyToken, async (req, res) => {
    try {
      const clientId = req.params.id;
      const scheduleId = req.params.scheduleId;
      
      // Verificar se cliente existe
      const client = await db.findOne('clients', { id: clientId });
      
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado'
        });
      }
      
      // Buscar agendamento
      const schedule = await db.findOne('appointments', { 
        id: scheduleId,
        client_id: clientId
      });
      
      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: 'Agendamento não encontrado'
        });
      }
      
      // Verificar se já está cancelado ou concluído
      if (schedule.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          message: 'Agendamento já está cancelado'
        });
      }
      
      if (schedule.status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Não é possível cancelar um agendamento concluído'
        });
      }
      
      // Atualizar status
      await db.update('appointments', 
        { 
          status: 'cancelled',
          cancelled_at: new Date(),
          cancelled_by: req.user.id,
          updated_at: new Date()
        }, 
        { id: scheduleId }
      );
      
      // Buscar agendamento atualizado
      const updatedSchedule = await db.findOne('appointments', { id: scheduleId });
      
      // Enviar notificação de cancelamento
      // TODO: Integrar com o serviço de WhatsApp para envio da notificação
      
      return res.status(200).json({
        success: true,
        message: 'Agendamento cancelado com sucesso',
        schedule: updatedSchedule
      });
    } catch (error) {
      console.error(`Erro ao cancelar agendamento ${req.params.scheduleId} do cliente ${req.params.id}:`, error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao cancelar agendamento'
      });
    }
  });
  
  /**
   * @route GET /api/clients/:id/ratings
   * @desc Listar avaliações de um cliente
   * @access Privado
   */
  router.get('/:id/ratings', verifyToken, async (req, res) => {
    try {
      const clientId = req.params.id;
      
      // Verificar se cliente existe
      const client = await db.findOne('clients', { id: clientId });
      
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado'
        });
      }
      
      // Buscar avaliações
      const ratings = await db.find('ratings', 
        { client_id: clientId },
        'created_at',
        'DESC'
      );
      
      return res.status(200).json({
        success: true,
        ratings
      });
    } catch (error) {
      console.error(`Erro ao buscar avaliações do cliente ${req.params.id}:`, error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao buscar avaliações'
      });
    }
  });
  
  /**
   * @route POST /api/clients/:id/postsale
   * @desc Iniciar pesquisa de pós-venda
   * @access Privado
   */
  router.post('/:id/postsale', verifyToken, async (req, res) => {
    try {
      const clientId = req.params.id;
      const { service_type } = req.body;
      
      // Validar tipo de serviço
      if (!service_type) {
        return res.status(400).json({
          success: false,
          message: 'Tipo de serviço é obrigatório'
        });
      }
      
      // Verificar se cliente existe
      const client = await db.findOne('clients', { id: clientId });
      
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Cliente não encontrado'
        });
      }
      
      // Buscar mensagem de pesquisa de satisfação
      const surveyMessage = await db.findOne('settings', { key: 'satisfaction_survey_message' });
      
      let message = 'Olá! Gostaríamos de saber como foi sua experiência com nosso serviço.';
      
      if (surveyMessage && surveyMessage.value) {
        message = surveyMessage.value
          .replace('{cliente}', client.name || 'Cliente')
          .replace('{serviço}', service_type);
      }
      
      // Criar mensagem de pesquisa
      const newMessage = {
        client_id: clientId,
        user_id: req.user.id,
        message_text: message,
        direction: 'outgoing',
        status: 'pending',
        message_type: 'survey',
        created_at: new Date()
      };
      
      const result = await db.insert('messages', newMessage);
      
      // Registrar pesquisa iniciada
      await db.insert('postsale_surveys', {
        client_id: clientId,
        service_type,
        initiated_by: req.user.id,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date()
      });
      
      // TODO: Integrar com o serviço de WhatsApp para envio da pesquisa
      
      return res.status(200).json({
        success: true,
        message: 'Pesquisa de satisfação iniciada com sucesso'
      });
    } catch (error) {
      console.error(`Erro ao iniciar pesquisa de pós-venda para cliente ${req.params.id}:`, error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao iniciar pesquisa de pós-venda'
      });
    }
  });
  
  // Exportar router
  module.exports = router;