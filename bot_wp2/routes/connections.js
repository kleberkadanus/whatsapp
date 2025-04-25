/**
 * connection.js - Rotas para gerenciamento de conexões WhatsApp
 * 
 * Este arquivo define as rotas da API para operações relacionadas
 * às conexões do WhatsApp, como iniciar, desconectar, verificar status
 * e gerenciar múltiplas conexões.
 */

const express = require('express');
const router = express.Router();
const db = require('../backend/database');
const { verifyToken } = require('./auth');
const fs = require('fs');
const path = require('path');
const config = require('../config/app.config');
const qrcode = require('qrcode');

// Referência para o módulo de conexão WhatsApp (importado pelo arquivo principal)
let whatsappService;

// Função para injetar o serviço de WhatsApp
function setWhatsappService(service) {
  whatsappService = service;
}

/**
 * @route GET /api/connections
 * @desc Obter lista de conexões
 * @access Privado
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    // Verificar permissão (apenas admin e manager podem listar todas as conexões)
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        message: 'Permissão negada'
      });
    }
    
    // Buscar conexões no banco de dados
    const connections = await db.find('whatsapp_connections', {}, 'created_at', 'DESC');
    
    // Adicionar status atual de cada conexão
    if (whatsappService) {
      for (let connection of connections) {
        connection.current_status = whatsappService.getConnectionStatus(connection.id);
        connection.qr_code = null; // Não enviar QR code na listagem
      }
    }
    
    return res.status(200).json({
      success: true,
      connections
    });
  } catch (error) {
    console.error('Erro ao listar conexões:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao listar conexões'
    });
  }
});

/**
 * @route POST /api/connections
 * @desc Criar nova conexão
 * @access Privado (admin)
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    // Verificar permissão (apenas admin pode criar conexões)
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Permissão negada'
      });
    }
    
    const { name, description, phone_number } = req.body;
    
    // Validar dados
    if (!name || !phone_number) {
      return res.status(400).json({
        success: false,
        message: 'Nome e número de telefone são obrigatórios'
      });
    }
    
    // Verificar se já existe uma conexão com mesmo nome ou número
    const existingConnection = await db.findOne('whatsapp_connections', {
      $or: [
        { name },
        { phone_number }
      ]
    });
    
    if (existingConnection) {
      return res.status(409).json({
        success: false,
        message: 'Já existe uma conexão com este nome ou número'
      });
    }
    
    // Criar nova conexão no banco de dados
    const newConnection = {
      name,
      description: description || null,
      phone_number,
      status: 'disconnected',
      created_by: req.user.id,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    const result = await db.insert('whatsapp_connections', newConnection);
    
    // Criar diretório para dados da conexão
    const connectionDir = path.join(config.whatsapp.authDir, `session-${result.id}`);
    if (!fs.existsSync(connectionDir)) {
      fs.mkdirSync(connectionDir, { recursive: true });
    }
    
    // Buscar conexão criada
    const connection = await db.findOne('whatsapp_connections', { id: result.id });
    
    return res.status(201).json({
      success: true,
      message: 'Conexão criada com sucesso',
      connection
    });
  } catch (error) {
    console.error('Erro ao criar conexão:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao criar conexão'
    });
  }
});

/**
 * @route GET /api/connections/:id
 * @desc Obter detalhes de uma conexão
 * @access Privado
 */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const connectionId = req.params.id;
    
    // Buscar conexão
    const connection = await db.findOne('whatsapp_connections', { id: connectionId });
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Conexão não encontrada'
      });
    }
    
    // Adicionar status atual
    if (whatsappService) {
      connection.current_status = whatsappService.getConnectionStatus(connectionId);
      
      // Se status for 'qr_code', buscar QR code atual
      if (connection.current_status === 'qr_code') {
        const qrData = whatsappService.getQRCode(connectionId);
        if (qrData) {
          // Gerar QR code como data URL
          connection.qr_code = await qrcode.toDataURL(qrData);
        }
      } else {
        connection.qr_code = null;
      }
    }
    
    // Buscar estatísticas
    const stats = await db.query(`
      SELECT 
        COUNT(DISTINCT m.id) as messages_count,
        COUNT(DISTINCT c.id) as clients_count,
        MAX(m.created_at) as last_activity
      FROM whatsapp_connections wc
      LEFT JOIN messages m ON wc.id = m.connection_id
      LEFT JOIN clients c ON wc.id = c.connection_id
      WHERE wc.id = ?
    `, [connectionId]);
    
    return res.status(200).json({
      success: true,
      connection,
      stats: stats[0]
    });
  } catch (error) {
    console.error(`Erro ao buscar conexão ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar detalhes da conexão'
    });
  }
});

/**
 * @route PUT /api/connections/:id
 * @desc Atualizar uma conexão
 * @access Privado (admin)
 */
router.put('/:id', verifyToken, async (req, res) => {
  try {
    // Verificar permissão (apenas admin pode atualizar conexões)
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Permissão negada'
      });
    }
    
    const connectionId = req.params.id;
    const { name, description, active } = req.body;
    
    // Buscar conexão
    const connection = await db.findOne('whatsapp_connections', { id: connectionId });
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Conexão não encontrada'
      });
    }
    
    // Preparar dados para atualização
    const updateData = {
      name: name || connection.name,
      description: typeof description !== 'undefined' ? description : connection.description,
      active: typeof active !== 'undefined' ? active : connection.active,
      updated_at: new Date()
    };
    
    // Atualizar conexão
    await db.update('whatsapp_connections', updateData, { id: connectionId });
    
    // Buscar conexão atualizada
    const updatedConnection = await db.findOne('whatsapp_connections', { id: connectionId });
    
    // Se foi desativada, desconectar
    if (connection.active && !updatedConnection.active && whatsappService) {
      whatsappService.disconnect(connectionId)
        .catch(err => console.error(`Erro ao desconectar ${connectionId}:`, err));
    }
    
    return res.status(200).json({
      success: true,
      message: 'Conexão atualizada com sucesso',
      connection: updatedConnection
    });
  } catch (error) {
    console.error(`Erro ao atualizar conexão ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar conexão'
    });
  }
});

/**
 * @route DELETE /api/connections/:id
 * @desc Remover uma conexão
 * @access Privado (admin)
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    // Verificar permissão (apenas admin pode remover conexões)
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Permissão negada'
      });
    }
    
    const connectionId = req.params.id;
    
    // Buscar conexão
    const connection = await db.findOne('whatsapp_connections', { id: connectionId });
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Conexão não encontrada'
      });
    }
    
    // Desconectar se estiver conectada
    if (whatsappService) {
      await whatsappService.disconnect(connectionId)
        .catch(err => console.error(`Erro ao desconectar ${connectionId}:`, err));
    }
    
    // Remover diretório de dados
    const connectionDir = path.join(config.whatsapp.authDir, `session-${connectionId}`);
    if (fs.existsSync(connectionDir)) {
      fs.rmSync(connectionDir, { recursive: true, force: true });
    }
    
    // Marcar como excluída (soft delete)
    await db.update('whatsapp_connections', 
      { 
        deleted: true,
        deleted_at: new Date(),
        updated_at: new Date()
      }, 
      { id: connectionId }
    );
    
    return res.status(200).json({
      success: true,
      message: 'Conexão removida com sucesso'
    });
  } catch (error) {
    console.error(`Erro ao remover conexão ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao remover conexão'
    });
  }
});

/**
 * @route POST /api/connections/:id/connect
 * @desc Iniciar conexão
 * @access Privado
 */
router.post('/:id/connect', verifyToken, async (req, res) => {
  try {
    const connectionId = req.params.id;
    
    // Buscar conexão
    const connection = await db.findOne('whatsapp_connections', { id: connectionId });
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Conexão não encontrada'
      });
    }
    
    if (!connection.active) {
      return res.status(400).json({
        success: false,
        message: 'Esta conexão está desativada'
      });
    }
    
    // Verificar se o serviço está disponível
    if (!whatsappService) {
      return res.status(503).json({
        success: false,
        message: 'Serviço de WhatsApp indisponível'
      });
    }
    
    // Iniciar conexão
    await whatsappService.connect(connectionId);
    
    // Atualizar status
    await db.update('whatsapp_connections', 
      { 
        status: 'connecting',
        updated_at: new Date()
      }, 
      { id: connectionId }
    );
    
    return res.status(200).json({
      success: true,
      message: 'Processo de conexão iniciado'
    });
  } catch (error) {
    console.error(`Erro ao conectar ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao iniciar conexão'
    });
  }
});

/**
 * @route POST /api/connections/:id/disconnect
 * @desc Desconectar
 * @access Privado
 */
router.post('/:id/disconnect', verifyToken, async (req, res) => {
  try {
    const connectionId = req.params.id;
    
    // Buscar conexão
    const connection = await db.findOne('whatsapp_connections', { id: connectionId });
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Conexão não encontrada'
      });
    }
    
    // Verificar se o serviço está disponível
    if (!whatsappService) {
      return res.status(503).json({
        success: false,
        message: 'Serviço de WhatsApp indisponível'
      });
    }
    
    // Desconectar
    await whatsappService.disconnect(connectionId);
    
    // Atualizar status
    await db.update('whatsapp_connections', 
      { 
        status: 'disconnected',
        updated_at: new Date()
      }, 
      { id: connectionId }
    );
    
    return res.status(200).json({
      success: true,
      message: 'Desconectado com sucesso'
    });
  } catch (error) {
    console.error(`Erro ao desconectar ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao desconectar'
    });
  }
});

/**
 * @route GET /api/connections/:id/qrcode
 * @desc Obter QR code para autenticação
 * @access Privado
 */
router.get('/:id/qrcode', verifyToken, async (req, res) => {
  try {
    const connectionId = req.params.id;
    
    // Buscar conexão
    const connection = await db.findOne('whatsapp_connections', { id: connectionId });
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Conexão não encontrada'
      });
    }
    
    // Verificar se o serviço está disponível
    if (!whatsappService) {
      return res.status(503).json({
        success: false,
        message: 'Serviço de WhatsApp indisponível'
      });
    }
    
    // Verificar status
    const status = whatsappService.getConnectionStatus(connectionId);
    
    if (status !== 'qr_code') {
      return res.status(400).json({
        success: false,
        message: 'QR code não disponível no momento',
        status
      });
    }
    
    // Obter QR code
    const qrData = whatsappService.getQRCode(connectionId);
    
    if (!qrData) {
      return res.status(404).json({
        success: false,
        message: 'QR code não encontrado'
      });
    }
    
    // Gerar QR code como imagem PNG
    const qrBuffer = await qrcode.toBuffer(qrData);
    
    res.set('Content-Type', 'image/png');
    return res.send(qrBuffer);
  } catch (error) {
    console.error(`Erro ao obter QR code para ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao obter QR code'
    });
  }
});

/**
 * @route GET /api/connections/:id/status
 * @desc Verificar status da conexão
 * @access Privado
 */
router.get('/:id/status', verifyToken, async (req, res) => {
  try {
    const connectionId = req.params.id;
    
    // Buscar conexão
    const connection = await db.findOne('whatsapp_connections', { id: connectionId });
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Conexão não encontrada'
      });
    }
    
    // Verificar se o serviço está disponível
    if (!whatsappService) {
      return res.status(503).json({
        success: false,
        message: 'Serviço de WhatsApp indisponível'
      });
    }
    
    // Obter status atual
    const status = whatsappService.getConnectionStatus(connectionId);
    const batteryLevel = whatsappService.getBatteryLevel(connectionId);
    
    return res.status(200).json({
      success: true,
      status,
      battery: batteryLevel,
      db_status: connection.status,
      last_updated: connection.updated_at
    });
  } catch (error) {
    console.error(`Erro ao verificar status para ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao verificar status'
    });
  }
});

/**
 * @route POST /api/connections/:id/clear
 * @desc Limpar dados de sessão
 * @access Privado (admin)
 */
router.post('/:id/clear', verifyToken, async (req, res) => {
  try {
    // Verificar permissão (apenas admin pode limpar sessões)
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Permissão negada'
      });
    }
    
    const connectionId = req.params.id;
    
    // Buscar conexão
    const connection = await db.findOne('whatsapp_connections', { id: connectionId });
    
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Conexão não encontrada'
      });
    }
    
    // Verificar se o serviço está disponível
    if (!whatsappService) {
      return res.status(503).json({
        success: false,
        message: 'Serviço de WhatsApp indisponível'
      });
    }
    
    // Desconectar se estiver conectado
    await whatsappService.disconnect(connectionId)
      .catch(err => console.error(`Erro ao desconectar ${connectionId}:`, err));
    
    // Limpar diretório de dados
    const connectionDir = path.join(config.whatsapp.authDir, `session-${connectionId}`);
    if (fs.existsSync(connectionDir)) {
      fs.rmSync(connectionDir, { recursive: true, force: true });
      fs.mkdirSync(connectionDir, { recursive: true });
    }
    
    // Atualizar status
    await db.update('whatsapp_connections', 
      { 
        status: 'disconnected',
        updated_at: new Date()
      }, 
      { id: connectionId }
    );
    
    return res.status(200).json({
      success: true,
      message: 'Dados de sessão limpos com sucesso'
    });
  } catch (error) {
    console.error(`Erro ao limpar dados de sessão para ${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao limpar dados de sessão'
    });
  }
});

// Exportar setters e router
module.exports = {
  router,
  setWhatsappService
};