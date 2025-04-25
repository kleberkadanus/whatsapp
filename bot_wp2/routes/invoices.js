/**
 * Rotas para gerenciamento de boletos
 * Funcionalidades:
 * - Listar boletos
 * - Buscar boletos por cliente
 * - Enviar boletos por WhatsApp
 * - Upload de novos boletos
 * - Exclusão de boletos
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken } = require('../middleware/auth');
const db = require('../backend/database');

// Configuração do armazenamento para upload de PDFs
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './invoices/');
  },
  filename: (req, file, cb) => {
    const clientPhone = req.body.phoneNumber.replace(/\D/g, ''); // Remove não-dígitos
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `boleto_${clientPhone}_${dateStr}_${path.basename(file.originalname)}`;
    cb(null, fileName);
  }
});

// Filtro para aceitar apenas arquivos PDF
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Apenas arquivos PDF são permitidos'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // Limite de 5MB
});

// Middleware para verificar se o diretório de boletos existe
const checkInvoicesDir = (req, res, next) => {
  const dir = './invoices';
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
  }
  next();
};

// Obter todos os boletos
router.get('/', verifyToken, async (req, res) => {
  try {
    const [invoices] = await db.promise().query(
      `SELECT i.*, c.name as clientName, c.phone 
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       ORDER BY i.due_date DESC`
    );
    res.json(invoices);
  } catch (error) {
    console.error('Erro ao buscar boletos:', error);
    res.status(500).json({ error: 'Erro ao buscar boletos' });
  }
});

// Obter boletos de um cliente específico
router.get('/client/:clientId', verifyToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    const [invoices] = await db.promise().query(
      `SELECT * FROM invoices WHERE client_id = ? ORDER BY due_date DESC`,
      [clientId]
    );
    res.json(invoices);
  } catch (error) {
    console.error('Erro ao buscar boletos do cliente:', error);
    res.status(500).json({ error: 'Erro ao buscar boletos do cliente' });
  }
});

// Obter boletos por número de telefone
router.get('/phone/:phone', verifyToken, async (req, res) => {
  try {
    const phone = req.params.phone.replace(/\D/g, ''); // Remove não-dígitos
    const [invoices] = await db.promise().query(
      `SELECT i.* FROM invoices i
       INNER JOIN clients c ON i.client_id = c.id
       WHERE c.phone LIKE ?
       ORDER BY i.due_date DESC`,
      [`%${phone}%`]
    );
    res.json(invoices);
  } catch (error) {
    console.error('Erro ao buscar boletos pelo telefone:', error);
    res.status(500).json({ error: 'Erro ao buscar boletos pelo telefone' });
  }
});

// Fazer upload de um novo boleto
router.post('/upload', verifyToken, checkInvoicesDir, upload.single('invoice'), async (req, res) => {
  try {
    const { clientId, description, dueDate, amount } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    // Verificar se o cliente existe
    const [clients] = await db.promise().query('SELECT id FROM clients WHERE id = ?', [clientId]);
    if (clients.length === 0) {
      // Remover o arquivo se o cliente não existir
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    // Salvar os dados do boleto no banco
    const [result] = await db.promise().query(
      `INSERT INTO invoices (client_id, file_path, description, due_date, amount, status, created_at) 
       VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
      [clientId, req.file.path, description, dueDate, amount]
    );
    
    res.status(201).json({
      id: result.insertId,
      message: 'Boleto enviado com sucesso',
      fileName: req.file.filename
    });
  } catch (error) {
    console.error('Erro ao fazer upload do boleto:', error);
    // Se ocorrer um erro e o arquivo foi carregado, remova-o
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Erro ao fazer upload do boleto' });
  }
});

// Excluir um boleto
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar o arquivo antes de excluir
    const [invoices] = await db.promise().query('SELECT file_path FROM invoices WHERE id = ?', [id]);
    
    if (invoices.length === 0) {
      return res.status(404).json({ error: 'Boleto não encontrado' });
    }
    
    // Remover do banco de dados
    await db.promise().query('DELETE FROM invoices WHERE id = ?', [id]);
    
    // Remover o arquivo físico
    const filePath = invoices[0].file_path;
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    res.json({ message: 'Boleto excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir boleto:', error);
    res.status(500).json({ error: 'Erro ao excluir boleto' });
  }
});

// Marcar boleto como pago
router.patch('/:id/status', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'paid', 'expired'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido. Use: pending, paid ou expired' });
    }
    
    await db.promise().query(
      'UPDATE invoices SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );
    
    res.json({ message: 'Status do boleto atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar status do boleto:', error);
    res.status(500).json({ error: 'Erro ao atualizar status do boleto' });
  }
});

// Buscar boleto por ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [invoices] = await db.promise().query(
      `SELECT i.*, c.name as clientName 
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       WHERE i.id = ?`,
      [id]
    );
    
    if (invoices.length === 0) {
      return res.status(404).json({ error: 'Boleto não encontrado' });
    }
    
    res.json(invoices[0]);
  } catch (error) {
    console.error('Erro ao buscar boleto:', error);
    res.status(500).json({ error: 'Erro ao buscar boleto' });
  }
});

// Rota para obter dados para a API do WhatsApp (usado pelo backend)
router.get('/whatsapp/:phone', async (req, res) => {
  try {
    const phone = req.params.phone.replace(/\D/g, '');
    const [invoices] = await db.promise().query(
      `SELECT i.id, i.description, i.file_path, i.due_date, i.amount, i.status
       FROM invoices i
       INNER JOIN clients c ON i.client_id = c.id
       WHERE c.phone LIKE ? AND i.status = 'pending'
       ORDER BY i.due_date ASC`,
      [`%${phone}%`]
    );
    
    // Formatar resposta para o bot
    const formattedInvoices = invoices.map(inv => ({
      id: inv.id,
      description: inv.description,
      dueDate: new Date(inv.due_date).toLocaleDateString('pt-BR'),
      amount: parseFloat(inv.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      filePath: inv.file_path
    }));
    
    res.json(formattedInvoices);
  } catch (error) {
    console.error('Erro ao buscar boletos para WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao buscar boletos' });
  }
});

// Rota para download do boleto
router.get('/download/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [invoices] = await db.promise().query('SELECT file_path, description FROM invoices WHERE id = ?', [id]);
    
    if (invoices.length === 0 || !invoices[0].file_path) {
      return res.status(404).json({ error: 'Boleto não encontrado' });
    }
    
    const filePath = invoices[0].file_path;
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo do boleto não encontrado' });
    }
    
    // Enviar o arquivo para download
    res.download(filePath, `${invoices[0].description}.pdf`);
  } catch (error) {
    console.error('Erro ao fazer download do boleto:', error);
    res.status(500).json({ error: 'Erro ao fazer download do boleto' });
  }
});

module.exports = router;