const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
// Carregar configurações do banco de dados
let dbConfig;
try {
  dbConfig = require('../config/database.config');
} catch (err) {
  // Se o arquivo de configuração não for encontrado, usar variáveis de ambiente (.env)
  dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'whatsapp_bot',
    // multipleStatements pode ser habilitado se necessário para executar scripts SQL multi-line
    multipleStatements: true
  };
}

// Criar pool de conexões MySQL
const pool = mysql.createPool(dbConfig);

/**
 * Inicializa o banco de dados criando as tabelas necessárias, caso ainda não existam.
 * Executa o script SQL de criação do banco de dados.
 */
async function initDatabase() {
    try {
      // 1) Verifica se já há menus — se sim, assume que o banco já foi criado
      const [rows] = await pool.promise().query(
        'SELECT COUNT(*) AS cnt FROM menus'
      );
      if (rows[0].cnt > 0) {
        console.log('Banco já inicializado, pulando create_database.sql');
        return;
      }
  
      // 2) Se não existirem menus, carrega e executa o script completo
      const sqlFilePath = path.join(__dirname, '../create_database.sql');
      const sqlSchema   = fs.readFileSync(sqlFilePath, 'utf8');
      await pool.promise().query(sqlSchema);
      console.log('Banco inicializado com sucesso');
    } catch (err) {
      console.error('Erro ao inicializar banco de dados:', err);
    }
  }

/**
 * Remove sessões antigas da tabela de sessões (usado ao iniciar o app para limpar dados obsoletos).
 */
async function cleanUpSessions() {
  try {
    await pool.promise().query("DELETE FROM sessions");
  } catch (err) {
    console.error('Erro ao limpar sessões antigas:', err);
  }
}

/**
 * Busca um usuário pelo telefone. 
 * Se não existir, cria um novo registro e retorna o usuário.
 * @param {string} phone - Telefone do usuário (formato internacional ou local).
 * @returns {Object|null} Usuário encontrado/criado (objeto com campos do BD) ou null se falhar.
 */
async function getOrCreateUser(phone) {
  try {
    const [rows] = await pool.promise().query(
      "SELECT * FROM users WHERE phone = ?",
      [phone]
    );
    if (rows.length > 0) {
      return rows[0];
    }
    // Se não encontrou, criar novo usuário
    const [result] = await pool.promise().execute(
      "INSERT INTO users (phone) VALUES (?)",
      [phone]
    );
    const insertId = result.insertId;
    // Buscar o usuário recém-criado
    const [newRows] = await pool.promise().query(
      "SELECT * FROM users WHERE id = ?",
      [insertId]
    );
    if (newRows.length > 0) {
      return newRows[0];
    }
    return null;
  } catch (err) {
    console.error('Erro ao obter/criar usuário:', err);
    return null;
  }
}

/**
 * Obtém a sessão ativa de um usuário (a última sessão registrada para o usuário).
 * @param {number} userId - ID do usuário.
 * @returns {Object|null} Sessão ativa ou null se não houver.
 */
async function getActiveSession(userId) {
  try {
    const [rows] = await pool.promise().query(
      "SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1",
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error('Erro ao obter sessão ativa:', err);
    return null;
  }
}

/**
 * Cria uma nova sessão para o usuário dado, com menu inicial opcional.
 * @param {number} userId - ID do usuário.
 * @param {string} [menu='init'] - Menu inicial da sessão (padrão 'init').
 * @returns {Object|null} Sessão criada (objeto completo) ou null em caso de erro.
 */
async function createSession(userId, menu = 'init') {
  try {
    const [result] = await pool.promise().execute(
      "INSERT INTO sessions (user_id, menu, current_menu) VALUES (?, ?, ?)",
      [userId, menu, menu]
    );
    const insertId = result.insertId;
    const [rows] = await pool.promise().query(
      "SELECT * FROM sessions WHERE id = ?",
      [insertId]
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error('Erro ao criar sessão:', err);
    return null;
  }
}

/**
 * Salva uma mensagem no histórico.
 * @param {number} userId - ID do usuário remetente ou destinatário da mensagem.
 * @param {string} direction - Direção da mensagem ('incoming' ou 'outgoing').
 * @param {string} messageText - Conteúdo da mensagem.
 * @param {string} [messageType='text'] - Tipo da mensagem (por exemplo 'text', 'image', etc).
 * @returns {boolean} Retorna true se salvou com sucesso, false em caso de erro.
 */
async function saveMessage(userId, direction, messageText, messageType = 'text') {
  try {
    await pool.promise().execute(
      "INSERT INTO messages (user_id, direction, message_text, message_type) VALUES (?, ?, ?, ?)",
      [userId, direction, messageText, messageType]
    );
    return true;
  } catch (err) {
    console.error('Erro ao salvar mensagem:', err);
    return false;
  }
}

/**
 * Obtém um texto personalizado a partir da chave.
 * @param {string} key - Chave do texto personalizado.
 * @returns {string|null} O texto correspondente ou null se não encontrado.
 */
async function getCustomText(key) {
  try {
    const [rows] = await pool.promise().query(
      "SELECT text_value FROM custom_texts WHERE text_key = ?",
      [key]
    );
    return rows.length > 0 ? rows[0].text_value : null;
  } catch (err) {
    console.error('Erro ao obter texto personalizado:', err);
    return null;
  }
}

/**
 * Obtém o valor de configuração a partir de uma chave.
 * @param {string} key - Nome da configuração.
 * @returns {string|null} Valor da configuração ou null se não encontrada.
 */
async function getConfig(key) {
  try {
    const [rows] = await pool.promise().query(
      "SELECT key_value FROM configs WHERE key_name = ?",
      [key]
    );
    return rows.length > 0 ? rows[0].key_value : null;
  } catch (err) {
    console.error('Erro ao obter config:', err);
    return null;
  }
}

/**
 * Define ou atualiza uma configuração (par chave-valor).
 * @param {string} key - Nome da configuração.
 * @param {string} value - Valor a ser definido.
 * @returns {boolean} True se a operação for bem sucedida, false em caso de erro.
 */
async function setConfig(key, value) {
  try {
    await pool.promise().execute(
      "INSERT INTO configs (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = VALUES(key_value)",
      [key, value]
    );
    return true;
  } catch (err) {
    console.error('Erro ao definir config:', err);
    return false;
  }
}

/**
 * Retorna todas as configurações registradas no sistema.
 * @returns {Array<Object>} Lista de objetos de configuração (key_name e key_value).
 */
async function getAllConfig() {
  try {
    const [rows] = await pool.promise().query("SELECT key_name, key_value FROM configs");
    return rows;
  } catch (err) {
    console.error('Erro ao obter todas as configs:', err);
    return [];
  }
}

/**
 * Obtém estatísticas gerais do sistema (quantidades de registros importantes).
 * @returns {Object|null} Objeto com contagens (ex: totalUsers, totalMessages, pendingSchedulings) ou null em caso de erro.
 */
async function getStats() {
  try {
    const [usersCount] = await pool.promise().query(
      "SELECT COUNT(*) AS total_users FROM users"
    );
    const [messagesCount] = await pool.promise().query(
      "SELECT COUNT(*) AS total_messages FROM messages"
    );
    const [schedulesCount] = await pool.promise().query(
      "SELECT COUNT(*) AS total_schedulings FROM schedulings WHERE status = 'pending'"
    );
    return {
      totalUsers: usersCount[0]?.total_users ?? 0,
      totalMessages: messagesCount[0]?.total_messages ?? 0,
      pendingSchedulings: schedulesCount[0]?.total_schedulings ?? 0
    };
  } catch (err) {
    console.error('Erro ao obter estatísticas:', err);
    return null;
  }
}

/**
 * Verifica se um determinado número de telefone está bloqueado.
 * @param {string} phone - Número de telefone a verificar.
 * @returns {boolean} True se o número está bloqueado, false caso contrário ou em erro.
 */
async function isBlockedNumber(phone) {
  try {
    const [rows] = await pool.promise().query(
      "SELECT id FROM blocked_numbers WHERE phone = ?",
      [phone]
    );
    return rows.length > 0;
  } catch (err) {
    console.error('Erro ao verificar número bloqueado:', err);
    return false;
  }
}

/**
 * Busca um usuário pelo número de telefone ou nome (parcial).
 * @param {string} query - Trecho de telefone ou nome para busca.
 * @returns {Object|null} Usuário encontrado ou null se não encontrado.
 */
async function findUserByPhoneOrName(query) {
  try {
    const term = '%' + query + '%';
    const [rows] = await pool.promise().query(
      "SELECT * FROM users WHERE phone LIKE ? OR name LIKE ? LIMIT 1",
      [term, term]
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error('Erro ao buscar usuário por telefone/nome:', err);
    return null;
  }
}

/**
 * Obtém o histórico de mensagens de um usuário, limitado a uma quantidade.
 * @param {number} userId - ID do usuário.
 * @param {number} [limit=50] - Quantidade máxima de mensagens a retornar.
 * @returns {Array<Object>} Lista de mensagens (do mais recente ao mais antigo, limitado pela quantidade).
 */
async function getMessageHistory(userId, limit = 50) {
  try {
    const numLimit = Number(limit) || 50;
    const [rows] = await pool.promise().query(
      "SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
      [userId, numLimit]
    );
    return rows;
  } catch (err) {
    console.error('Erro ao obter histórico de mensagens:', err);
    return [];
  }
}

/**
 * Obtém todos os agendamentos (schedulings) dentro de um intervalo de datas.
 * @param {string|Date} startDate - Data/hora de início do intervalo.
 * @param {string|Date} endDate - Data/hora de fim do intervalo.
 * @returns {Array<Object>} Lista de agendamentos no intervalo especificado.
 */
async function getSchedulingsByDateRange(startDate, endDate) {
  try {
    const [rows] = await pool.promise().query(
      "SELECT * FROM schedulings WHERE appointment_date BETWEEN ? AND ?",
      [startDate, endDate]
    );
    return rows;
  } catch (err) {
    console.error('Erro ao obter agendamentos por período:', err);
    return [];
  }
}

// Anexar todas as funções e o pool à exportação
pool.initDatabase = initDatabase;
pool.cleanUpSessions = cleanUpSessions;
pool.getOrCreateUser = getOrCreateUser;
pool.getActiveSession = getActiveSession;
pool.createSession = createSession;
pool.saveMessage = saveMessage;
pool.getCustomText = getCustomText;
pool.getConfig = getConfig;
pool.setConfig = setConfig;
pool.getAllConfig = getAllConfig;
pool.getStats = getStats;
pool.isBlockedNumber = isBlockedNumber;
pool.findUserByPhoneOrName = findUserByPhoneOrName;
pool.getMessageHistory = getMessageHistory;
pool.getSchedulingsByDateRange = getSchedulingsByDateRange;

// Também exportar a instância do pool diretamente
pool.pool = pool;  // permite acessar o pool como propriedade, se necessário

module.exports = pool;
