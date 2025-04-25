/**
 * Rotas para gerenciamento de configurações do sistema
 * Funcionalidades:
 * - Obter e atualizar configurações gerais
 * - Gerenciar conexões do WhatsApp
 * - Configurações de temas, timeout de sessão
 * - Configurações de horários de trabalho
 * - Backup e restauração do sistema
 */

const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const db = require('../backend/database');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const multer = require('multer');
const moment = require('moment');

// Configuração para upload de arquivos de backup
const upload = multer({ 
  dest: 'temp/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Obter todas as configurações
router.get('/', verifyToken, async (req, res) => {
  try {
    const [settings] = await db.promise().query('SELECT * FROM settings');
    
    // Converter valores JSON armazenados no banco
    const formattedSettings = settings.map(setting => ({
      ...setting,
      value: setting.is_json ? JSON.parse(setting.value) : setting.value
    }));
    
    // Organizar por categorias
    const categorizedSettings = {};
    
    formattedSettings.forEach(setting => {
      if (!categorizedSettings[setting.category]) {
        categorizedSettings[setting.category] = {};
      }
      
      categorizedSettings[setting.category][setting.name] = setting.value;
    });
    
    res.json(categorizedSettings);
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

// Obter configurações por categoria
router.get('/category/:category', verifyToken, async (req, res) => {
  try {
    const { category } = req.params;
    
    const [settings] = await db.promise().query(
      'SELECT * FROM settings WHERE category = ?',
      [category]
    );
    
    // Converter valores JSON armazenados no banco
    const formattedSettings = settings.map(setting => ({
      ...setting,
      value: setting.is_json ? JSON.parse(setting.value) : setting.value
    }));
    
    // Transformar em objeto chave-valor
    const result = {};
    formattedSettings.forEach(setting => {
      result[setting.name] = setting.value;
    });
    
    res.json(result);
  } catch (error) {
    console.error(`Erro ao buscar configurações da categoria ${req.params.category}:`, error);
    res.status(500).json({ error: `Erro ao buscar configurações da categoria ${req.params.category}` });
  }
});

// Obter uma configuração específica
router.get('/:name', verifyToken, async (req, res) => {
  try {
    const { name } = req.params;
    
    const [settings] = await db.promise().query(
      'SELECT * FROM settings WHERE name = ?',
      [name]
    );
    
    if (settings.length === 0) {
      return res.status(404).json({ error: 'Configuração não encontrada' });
    }
    
    const setting = settings[0];
    
    // Converter valor JSON se necessário
    if (setting.is_json) {
      setting.value = JSON.parse(setting.value);
    }
    
    res.json(setting);
  } catch (error) {
    console.error(`Erro ao buscar configuração ${req.params.name}:`, error);
    res.status(500).json({ error: `Erro ao buscar configuração ${req.params.name}` });
  }
});

// Atualizar uma configuração
router.put('/:name', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { name } = req.params;
    const { value, category, description } = req.body;
    
    // Verificar se a configuração existe
    const [existingSetting] = await db.promise().query(
      'SELECT * FROM settings WHERE name = ?',
      [name]
    );
    
    if (existingSetting.length === 0) {
      return res.status(404).json({ error: 'Configuração não encontrada' });
    }
    
    // Determinar se o valor é JSON
    const isJson = typeof value === 'object';
    const valueToStore = isJson ? JSON.stringify(value) : value;
    
    // Atualizar a configuração
    await db.promise().query(
      `UPDATE settings SET 
       value = ?, 
       category = ?, 
       description = ?,
       is_json = ?,
       updated_at = NOW()
       WHERE name = ?`,
      [valueToStore, category, description, isJson ? 1 : 0, name]
    );
    
    res.json({ 
      name, 
      value, 
      category, 
      description, 
      message: 'Configuração atualizada com sucesso' 
    });
  } catch (error) {
    console.error(`Erro ao atualizar configuração ${req.params.name}:`, error);
    res.status(500).json({ error: `Erro ao atualizar configuração ${req.params.name}` });
  }
});

// Criar uma nova configuração
router.post('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { name, value, category, description } = req.body;
    
    if (!name || value === undefined || !category) {
      return res.status(400).json({ error: 'Nome, valor e categoria são obrigatórios' });
    }
    
    // Verificar se já existe
    const [existingSetting] = await db.promise().query(
      'SELECT id FROM settings WHERE name = ?',
      [name]
    );
    
    if (existingSetting.length > 0) {
      return res.status(409).json({ error: 'Configuração com este nome já existe' });
    }
    
    // Determinar se o valor é JSON
    const isJson = typeof value === 'object';
    const valueToStore = isJson ? JSON.stringify(value) : value;
    
    // Inserir a configuração
    await db.promise().query(
      `INSERT INTO settings (name, value, category, description, is_json, created_at) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [name, valueToStore, category, description, isJson ? 1 : 0]
    );
    
    res.status(201).json({ 
      name, 
      value, 
      category, 
      description, 
      message: 'Configuração criada com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao criar configuração:', error);
    res.status(500).json({ error: 'Erro ao criar configuração' });
  }
});

// Excluir uma configuração
router.delete('/:name', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { name } = req.params;
    
    // Verificar se a configuração existe
    const [existingSetting] = await db.promise().query(
      'SELECT id FROM settings WHERE name = ?',
      [name]
    );
    
    if (existingSetting.length === 0) {
      return res.status(404).json({ error: 'Configuração não encontrada' });
    }
    
    // Excluir a configuração
    await db.promise().query('DELETE FROM settings WHERE name = ?', [name]);
    
    res.json({ message: 'Configuração excluída com sucesso' });
  } catch (error) {
    console.error(`Erro ao excluir configuração ${req.params.name}:`, error);
    res.status(500).json({ error: `Erro ao excluir configuração ${req.params.name}` });
  }
});

// Inicializar configurações padrão
router.post('/initialize', verifyToken, verifyAdmin, async (req, res) => {
  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Verificar se já existem configurações
    const [existingSettings] = await connection.query('SELECT COUNT(*) as count FROM settings');
    
    if (existingSettings[0].count > 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Sistema já possui configurações' });
    }
    
    // Configurações padrão
    const defaultSettings = [
      // Configurações gerais
      {
        name: 'system_name',
        value: 'WhatsApp Bot Manager',
        category: 'general',
        description: 'Nome do sistema',
        is_json: 0
      },
      {
        name: 'company_name',
        value: 'Minha Empresa',
        category: 'general',
        description: 'Nome da empresa',
        is_json: 0
      },
      {
        name: 'company_logo',
        value: '/img/logo.png',
        category: 'general',
        description: 'Logo da empresa',
        is_json: 0
      },
      {
        name: 'theme',
        value: 'light',
        category: 'general',
        description: 'Tema do sistema (light/dark)',
        is_json: 0
      },
      
      // Configurações de sessão
      {
        name: 'session_timeout',
        value: '30',
        category: 'session',
        description: 'Tempo de inatividade de uma sessão em minutos',
        is_json: 0
      },
      {
        name: 'session_expiration',
        value: '12',
        category: 'session',
        description: 'Tempo de expiração de um chat em horas',
        is_json: 0
      },
      
      // Configurações de agendamento
      {
        name: 'scheduling_reminder_hours',
        value: '4',
        category: 'scheduling',
        description: 'Horas antes da visita para enviar lembrete',
        is_json: 0
      },
      {
        name: 'scheduling_slot_duration',
        value: '60',
        category: 'scheduling',
        description: 'Duração de cada slot de agendamento em minutos',
        is_json: 0
      },
      {
        name: 'working_hours',
        value: JSON.stringify({
          start: '08:00',
          end: '18:00',
          daysOff: [0, 6], // Domingo e Sábado
          lunchBreak: {
            start: '12:00',
            end: '13:00'
          }
        }),
        category: 'scheduling',
        description: 'Horário de trabalho para agendamentos',
        is_json: 1
      },
      
      // Configurações financeiras
      {
        name: 'pix_key',
        value: '',
        category: 'financial',
        description: 'Chave PIX da empresa',
        is_json: 0
      },
      {
        name: 'pix_qrcode',
        value: '/resources/pix_qrcode.png',
        category: 'financial',
        description: 'QR Code do PIX',
        is_json: 0
      },
      
      // Configurações do WhatsApp
      {
        name: 'max_connections',
        value: '3',
        category: 'whatsapp',
        description: 'Número máximo de conexões do WhatsApp',
        is_json: 0
      },
      {
        name: 'reconnect_interval',
        value: '30',
        category: 'whatsapp',
        description: 'Intervalo de reconexão em segundos',
        is_json: 0
      },
      {
        name: 'message_delay',
        value: '2',
        category: 'whatsapp',
        description: 'Delay entre mensagens em segundos',
        is_json: 0
      },
      
      // Configurações LGPD
      {
        name: 'lgpd_terms_file',
        value: '/resources/termos_lgpd.pdf',
        category: 'lgpd',
        description: 'Arquivo de termos de uso e LGPD',
        is_json: 0
      },
      {
        name: 'data_retention_days',
        value: '365',
        category: 'lgpd',
        description: 'Dias para retenção de dados',
        is_json: 0
      },
      
      // Configurações de notificações
      {
        name: 'notification_email',
        value: '',
        category: 'notifications',
        description: 'Email para receber notificações',
        is_json: 0
      },
      {
        name: 'email_notifications',
        value: '0',
        category: 'notifications',
        description: 'Ativar notificações por email (0/1)',
        is_json: 0
      }
    ];
    
    // Inserir configurações padrão
    for (const setting of defaultSettings) {
      await connection.query(
        `INSERT INTO settings 
         (name, value, category, description, is_json, created_at) 
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          setting.name, 
          setting.value, 
          setting.category, 
          setting.description, 
          setting.is_json
        ]
      );
    }
    
    await connection.commit();
    res.status(201).json({ message: 'Configurações padrão inicializadas com sucesso' });
  } catch (error) {
    await connection.rollback();
    console.error('Erro ao inicializar configurações padrão:', error);
    res.status(500).json({ error: 'Erro ao inicializar configurações padrão' });
  } finally {
    connection.release();
  }
});

// Buscar configurações de WhatsApp para o bot
router.get('/whatsapp/config', async (req, res) => {
  try {
    const [settings] = await db.promise().query(
      'SELECT name, value FROM settings WHERE category = "whatsapp"'
    );
    
    // Transformar em objeto chave-valor
    const result = {};
    settings.forEach(setting => {
      result[setting.name] = setting.is_json ? JSON.parse(setting.value) : setting.value;
    });
    
    res.json(result);
  } catch (error) {
    console.error('Erro ao buscar configurações de WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao buscar configurações de WhatsApp' });
  }
});

// Criar backup do sistema
router.get('/backup', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const backupDir = path.join(__dirname, '..', '..', 'backups');
    
    // Criar diretório de backups se não existir
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = moment().format('YYYYMMDD_HHmmss');
    const backupFile = path.join(backupDir, `backup_${timestamp}.zip`);
    
    // Criar arquivo zip
    const output = fs.createWriteStream(backupFile);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Nível máximo de compressão
    });
    
    output.on('close', () => {
      // Obter tamanho do arquivo
      const fileSize = archive.pointer();
      const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
      
      res.json({
        message: 'Backup criado com sucesso',
        file: `backup_${timestamp}.zip`,
        size: fileSizeMB + ' MB',
        path: backupFile
      });
    });
    
    archive.on('error', (err) => {
      throw err;
    });
    
    archive.pipe(output);
    
    // Adicionar diretórios ao backup
    const dirsToBackup = [
      { src: path.join(__dirname, '..', '..', 'invoices'), name: 'invoices' },
      { src: path.join(__dirname, '..', '..', 'resources'), name: 'resources' },
      { src: path.join(__dirname, '..', '..', 'sql'), name: 'sql' }
    ];
    
    for (const dir of dirsToBackup) {
      if (fs.existsSync(dir.src)) {
        archive.directory(dir.src, dir.name);
      }
    }
    
    // Gerar dump do banco de dados
    const { exec } = require('child_process');
    const dbConfig = require('../../config/database.config');
    
    const dumpFile = path.join(backupDir, 'database_dump.sql');
    
    exec(`mysqldump -u${dbConfig.user} -p${dbConfig.password} ${dbConfig.database} > ${dumpFile}`, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Erro ao criar dump do banco: ${error.message}`);
        return res.status(500).json({ error: 'Erro ao criar dump do banco de dados' });
      }
      
      // Adicionar dump ao arquivo zip
      archive.file(dumpFile, { name: 'database_dump.sql' });
      
      // Finalizar o arquivo zip
      await archive.finalize();
      
      // Remover arquivo de dump temporário
      fs.unlinkSync(dumpFile);
    });
  } catch (error) {
    console.error('Erro ao criar backup:', error);
    res.status(500).json({ error: 'Erro ao criar backup' });
  }
});

// Baixar arquivo de backup
router.get('/backup/download/:file', verifyToken, verifyAdmin, (req, res) => {
  try {
    const { file } = req.params;
    const backupDir = path.join(__dirname, '..', '..', 'backups');
    const filePath = path.join(backupDir, file);
    
    // Verificar se o arquivo existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo de backup não encontrado' });
    }
    
    // Enviar o arquivo para download
    res.download(filePath);
  } catch (error) {
    console.error('Erro ao baixar backup:', error);
    res.status(500).json({ error: 'Erro ao baixar backup' });
  }
});

// Listar backups disponíveis
router.get('/backup/list', verifyToken, verifyAdmin, (req, res) => {
  try {
    const backupDir = path.join(__dirname, '..', '..', 'backups');
    
    // Verificar se o diretório existe
    if (!fs.existsSync(backupDir)) {
      return res.json({ backups: [] });
    }
    
    // Listar arquivos de backup
    const files = fs.readdirSync(backupDir).filter(file => file.endsWith('.zip'));
    
    // Obter informações detalhadas de cada arquivo
    const backups = files.map(file => {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      
      return {
        filename: file,
        size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
        created_at: moment(stats.birthtime).format('DD/MM/YYYY HH:mm:ss')
      };
    });
    
    // Ordenar por data de criação (mais recente primeiro)
    backups.sort((a, b) => {
      return new Date(b.created_at) - new Date(a.created_at);
    });
    
    res.json({ backups });
  } catch (error) {
    console.error('Erro ao listar backups:', error);
    res.status(500).json({ error: 'Erro ao listar backups' });
  }
});

// Restaurar backup
router.post('/backup/restore', verifyToken, verifyAdmin, upload.single('backup_file'), async (req, res) => {
  try {
    // Verificar se o arquivo foi enviado
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo de backup não enviado' });
    }
    
    const backupFilePath = req.file.path;
    const extractDir = path.join(__dirname, '..', '..', 'temp', 'restore_' + Date.now());
    
    // Criar diretório temporário para extração
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }
    
    // Extrair arquivo
    const extract = require('extract-zip');
    
    try {
      await extract(backupFilePath, { dir: extractDir });
      
      // Restaurar arquivos
      const dirsToRestore = [
        { src: path.join(extractDir, 'invoices'), dest: path.join(__dirname, '..', '..', 'invoices') },
        { src: path.join(extractDir, 'resources'), dest: path.join(__dirname, '..', '..', 'resources') },
        { src: path.join(extractDir, 'sql'), dest: path.join(__dirname, '..', '..', 'sql') }
      ];
      
      for (const dir of dirsToRestore) {
        if (fs.existsSync(dir.src)) {
          // Remover diretório de destino se existir
          if (fs.existsSync(dir.dest)) {
            fs.rmdirSync(dir.dest, { recursive: true });
          }
          
          // Copiar diretório
          fs.mkdirSync(dir.dest, { recursive: true });
          fs.cpSync(dir.src, dir.dest, { recursive: true });
        }
      }
      
      // Restaurar banco de dados
      const dumpFile = path.join(extractDir, 'database_dump.sql');
      
      if (fs.existsSync(dumpFile)) {
        const { exec } = require('child_process');
        const dbConfig = require('../../config/database.config');
        
        exec(`mysql -u${dbConfig.user} -p${dbConfig.password} ${dbConfig.database} < ${dumpFile}`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Erro ao restaurar banco de dados: ${error.message}`);
            return res.status(500).json({ error: 'Erro ao restaurar banco de dados' });
          }
          
          // Limpar arquivos temporários
          fs.unlinkSync(backupFilePath);
          fs.rmSync(extractDir, { recursive: true, force: true });
          
          res.json({ message: 'Backup restaurado com sucesso' });
        });
      } else {
        // Limpar arquivos temporários
        fs.unlinkSync(backupFilePath);
        fs.rmSync(extractDir, { recursive: true, force: true });
        
        res.status(400).json({ error: 'Arquivo de dump do banco de dados não encontrado no backup' });
      }
    } catch (extractError) {
      console.error('Erro ao extrair arquivo de backup:', extractError);
      res.status(500).json({ error: 'Erro ao extrair arquivo de backup' });
    }
  } catch (error) {
    console.error('Erro ao restaurar backup:', error);
    res.status(500).json({ error: 'Erro ao restaurar backup' });
  }
});

// Obter configurações públicas (sem autenticação)
router.get('/public/general', async (req, res) => {
  try {
    const [settings] = await db.promise().query(
      'SELECT name, value FROM settings WHERE category = "general" AND name IN ("system_name", "company_name", "company_logo")'
    );
    
    // Transformar em objeto chave-valor
    const result = {};
    settings.forEach(setting => {
      result[setting.name] = setting.is_json ? JSON.parse(setting.value) : setting.value;
    });
    
    res.json(result);
  } catch (error) {
    console.error('Erro ao buscar configurações públicas:', error);
    res.status(500).json({ error: 'Erro ao buscar configurações públicas' });
  }
});

module.exports = router;