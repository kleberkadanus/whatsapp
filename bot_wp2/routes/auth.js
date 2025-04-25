/**
 * auth.js - Rotas de autenticação da API
 * 
 * Este arquivo define as rotas relacionadas à autenticação de usuários,
 * incluindo login, verificação de token, alteração de senha e outras
 * funcionalidades relacionadas à segurança.
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../backend/database');
const config = require('../config/app.config');

// Middleware para verificar token
const verifyToken = (req, res, next) => {
  // Obter token do cabeçalho Authorization
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'Token de autenticação não fornecido'
    });
  }
  
  // Extrair token do cabeçalho
  const token = authHeader.split(' ')[1];
  
  try {
    // Verificar e decodificar o token
    const decoded = jwt.verify(token, config.auth.secretKey);
    
    // Adicionar dados do usuário à requisição
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Erro ao verificar token:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado',
        expired: true
      });
    }
    
    return res.status(401).json({
      success: false,
      message: 'Token inválido'
    });
  }
};

/**
 * @route POST /api/auth/login
 * @desc Autenticar usuário e gerar token
 * @access Público
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validar dados recebidos
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nome de usuário e senha são obrigatórios'
      });
    }
    
    // Buscar usuário no banco de dados
    const users = await db.find('users', { username });
    
    if (!users || users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }
    
    const user = users[0];
    
    // Verificar se o usuário está ativo
    if (!user.active) {
      return res.status(403).json({
        success: false,
        message: 'Usuário inativo. Entre em contato com o administrador.'
      });
    }
    
    // Verificar senha
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }
    
    // Dados do usuário para o token (excluir senha e outros dados sensíveis)
    const userData = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role
    };
    
    // Gerar token JWT
    const token = jwt.sign(userData, config.auth.secretKey, {
      expiresIn: config.auth.tokenExpiration
    });
    
    // Registrar login
    await db.insert('user_logs', {
      user_id: user.id,
      action: 'login',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_at: new Date()
    });
    
    // Retornar token e dados do usuário
    return res.status(200).json({
      success: true,
      message: 'Login realizado com sucesso',
      token,
      user: userData
    });
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao processar o login'
    });
  }
});

/**
 * @route GET /api/auth/verify
 * @desc Verificar token e retornar dados do usuário
 * @access Privado
 */
router.get('/verify', verifyToken, (req, res) => {
  // Token foi verificado pelo middleware, retornar dados do usuário
  return res.status(200).json({
    success: true,
    user: req.user
  });
});

/**
 * @route POST /api/auth/change-password
 * @desc Alterar senha do usuário
 * @access Privado
 */
router.post('/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Validar dados recebidos
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Senha atual e nova senha são obrigatórias'
      });
    }
    
    // Buscar usuário no banco de dados
    const user = await db.findOne('users', { id: req.user.id });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    // Verificar senha atual
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Senha atual incorreta'
      });
    }
    
    // Gerar hash da nova senha
    const salt = await bcrypt.genSalt(config.auth.saltRounds);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Atualizar senha no banco de dados
    await db.update('users', 
      { password: hashedPassword, updated_at: new Date() },
      { id: req.user.id }
    );
    
    // Registrar alteração de senha
    await db.insert('user_logs', {
      user_id: req.user.id,
      action: 'password_change',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_at: new Date()
    });
    
    return res.status(200).json({
      success: true,
      message: 'Senha alterada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao alterar senha'
    });
  }
});

/**
 * @route POST /api/auth/reset-password
 * @desc Solicitar redefinição de senha
 * @access Público
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'E-mail é obrigatório'
      });
    }
    
    // Buscar usuário pelo e-mail
    const user = await db.findOne('users', { email });
    
    if (!user) {
      // Não informar que o usuário não existe por questões de segurança
      return res.status(200).json({
        success: true,
        message: 'Se o e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha'
      });
    }
    
    // Gerar token para redefinição de senha
    const resetToken = jwt.sign(
      { id: user.id, email: user.email },
      config.auth.secretKey,
      { expiresIn: '1h' }
    );
    
    // Salvar token no banco de dados
    await db.update('users', 
      { 
        reset_token: resetToken,
        reset_token_expires: new Date(Date.now() + 3600000) // 1 hora
      },
      { id: user.id }
    );
    
    // TODO: Enviar e-mail com link para redefinição de senha
    // Esta parte dependeria de um serviço de envio de e-mails como nodemailer
    
    return res.status(200).json({
      success: true,
      message: 'Se o e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha'
    });
  } catch (error) {
    console.error('Erro ao solicitar redefinição de senha:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao solicitar redefinição de senha'
    });
  }
});

/**
 * @route POST /api/auth/complete-reset
 * @desc Completar redefinição de senha
 * @access Público
 */
router.post('/complete-reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token e nova senha são obrigatórios'
      });
    }
    
    // Verificar token
    let decoded;
    try {
      decoded = jwt.verify(token, config.auth.secretKey);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Token inválido ou expirado'
      });
    }
    
    // Buscar usuário pelo ID do token
    const user = await db.findOne('users', { 
      id: decoded.id,
      reset_token: token,
      reset_token_expires: { $gt: new Date() }
    });
    
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token inválido ou expirado'
      });
    }
    
    // Gerar hash da nova senha
    const salt = await bcrypt.genSalt(config.auth.saltRounds);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Atualizar senha e limpar token
    await db.update('users', 
      { 
        password: hashedPassword,
        reset_token: null,
        reset_token_expires: null,
        updated_at: new Date()
      },
      { id: user.id }
    );
    
    // Registrar redefinição de senha
    await db.insert('user_logs', {
      user_id: user.id,
      action: 'password_reset',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_at: new Date()
    });
    
    return res.status(200).json({
      success: true,
      message: 'Senha redefinida com sucesso'
    });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao redefinir senha'
    });
  }
});

/**
 * @route GET /api/auth/logout
 * @desc Registrar logout (o token será invalidado no cliente)
 * @access Privado
 */
router.get('/logout', verifyToken, async (req, res) => {
  try {
    // Registrar logout
    await db.insert('user_logs', {
      user_id: req.user.id,
      action: 'logout',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      created_at: new Date()
    });
    
    return res.status(200).json({
      success: true,
      message: 'Logout realizado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao registrar logout:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao processar logout'
    });
  }
});

// Exportar middleware para uso em outras rotas
module.exports.verifyToken = verifyToken;

// Exportar router
module.exports = router;