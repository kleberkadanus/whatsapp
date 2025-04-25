// menuManager.js - Módulo para gerenciar menus dinâmicos
const db = require('./database');

// Armazenamento em memória dos menus
let menus = {};

/**
 * Carrega todos os menus do banco de dados
 * @returns {Promise<Object>} - Objeto contendo todos os menus
 */
async function loadMenus() {
  try {
    console.log('Buscando todos os menus do banco de dados...');
    
    // 1. Obter todos os menus básicos
    const [menuRows] = await db.promise().execute('SELECT * FROM menus');
    
    if (!menuRows || menuRows.length === 0) {
      console.warn('Nenhum menu encontrado no banco de dados');
      
      // Menu padrão como fallback
      menus = createDefaultMenus();
      return menus;
    }
    
    console.log(`Encontrados ${menuRows.length} menus básicos no banco de dados`);
    
    // 2. Obter todas as opções de menu
    const [optionRows] = await db.promise().execute('SELECT * FROM menu_options ORDER BY menu_id, option_id');
    
    if (!optionRows || optionRows.length === 0) {
      console.warn('Nenhuma opção de menu encontrada no banco de dados');
    } else {
      console.log(`Encontradas ${optionRows.length} opções de menu no banco de dados`);
    }
    
    // 3. Montar estrutura de menus
    menus = {};
    
    for (const menu of menuRows) {
      
      // Encontrar todas as opções para este menu
      const menuOptions = optionRows.filter(opt => opt.menu_id === menu.id);
      
      // Formatar opções no formato esperado
      const options = menuOptions.map(opt => {
        const option = {
          id: opt.option_id,
          title: opt.title
        };
        
        // Adicionar campos opcionais apenas se existirem
        if (opt.next_menu) option.next_menu = opt.next_menu;
        if (opt.handler) option.handler = opt.handler;
        if (opt.agent_phone) option.agent_phone = opt.agent_phone;
        if (opt.config_key) option.config_key = opt.config_key;
        
        return option;
      });
      
      // Adicionar menu ao objeto final
      menus[menu.menu_key] = {
        title: menu.title,
        message: menu.message || '',
        options: options
      };
      
      console.log(`Menu '${menu.menu_key}' carregado com ${options.length} opções`);
    }
    
    // 4. Verificar menus essenciais e adicionar se não existirem
    ensureEssentialMenus();
    
    return menus;
  } catch (error) {
    console.error('Erro ao recuperar todos os menus:', error);
    
    // Menu padrão como fallback em caso de erro
    menus = createDefaultMenus();
    return menus;
  }
}

/**
 * Cria os menus padrão para fallback
 * @returns {Object} - Menus padrão
 */
function createDefaultMenus() {
  const defaultMenus = {
    'main': {
      title: 'Menu Principal',
      message: 'Em que podemos lhe ajudar hoje?',
      options: [
        {id: 1, title: "Suporte Técnico", next_menu: "support"},
        {id: 2, title: "Comercial", handler: "forward", config_key: "commercial_agent"},
        {id: 3, title: "Financeiro", next_menu: "financial"},
        {id: 4, title: "Agendar visita técnica", handler: "startScheduling"}
      ]
    },
    'support': {
      title: 'Suporte Técnico',
      message: 'Selecione o tipo de suporte:',
      options: [
        {id: 1, title: "Problema com internet", handler: "forward", config_key: "support_agent"},
        {id: 2, title: "Problema com equipamento", handler: "forward", config_key: "support_agent"},
        {id: 3, title: "Outros problemas", handler: "forward", config_key: "support_agent"},
        {id: 0, title: "Voltar", next_menu: "main"}
      ]
    },
    'financial': {
      title: 'Financeiro',
      message: 'Selecione uma opção:',
      options: [
        {id: 1, title: "2ª via de boleto", handler: "listInvoices"},
        {id: 2, title: "Chave PIX", handler: "sendPixKey"},
        {id: 3, title: "Falar com financeiro", handler: "forward", config_key: "financial_agent"},
        {id: 0, title: "Voltar", next_menu: "main"}
      ]
    },
    'schedule': {
      title: 'Agendamento',
      message: 'Selecione o tipo de serviço:',
      options: [
        {id: 1, title: "Instalação", handler: "scheduleService"},
        {id: 2, title: "Manutenção", handler: "scheduleService"},
        {id: 3, title: "Mudança de endereço", handler: "scheduleService"},
        {id: 0, title: "Voltar", next_menu: "main"}
      ]
    }
  };
  
  console.log('Menu padrão carregado como fallback');
  return defaultMenus;
}

/**
 * Garante que menus essenciais existam
 */
function ensureEssentialMenus() {
  // Lista de menus essenciais
  const essentialMenus = ['main', 'support', 'financial', 'schedule'];
  
  // Verificar se cada menu essencial existe
  for (const menuKey of essentialMenus) {
    if (!menus[menuKey]) {
      // Adicionar menu padrão se não existir
      const defaultMenus = createDefaultMenus();
      menus[menuKey] = defaultMenus[menuKey];
      console.log(`Menu essencial '${menuKey}' adicionado automaticamente`);
    }
  }
}

/**
 * Salva um menu no banco de dados
 * @param {String} key - Chave do menu
 * @param {Object} data - Dados do menu
 * @returns {Promise<Boolean>} - Se foi salvo com sucesso
 */
async function saveMenu(key, data) {
  try {
    // 1. Verificar se o menu já existe
    const [existingMenus] = await await db.promise().execute(
      'SELECT id FROM menus WHERE menu_key = ? LIMIT 1',
      [key]
    );
    
    let menuId;
    
    if (existingMenus && existingMenus.length > 0) {
      // Atualizar menu existente
      menuId = existingMenus[0].id;
      await await db.promise().execute(
        'UPDATE menus SET title = ?, message = ? WHERE id = ?',
        [data.title, data.message || '', menuId]
      );
    } else {
      // Criar novo menu
      const [result] = await await db.promise().execute(
        'INSERT INTO menus (menu_key, title, message) VALUES (?, ?, ?)',
        [key, data.title, data.message || '']
      );
      menuId = result.insertId;
    }
    
    // 2. Remover opções antigas
    await await db.promise().execute('DELETE FROM menu_options WHERE menu_id = ?', [menuId]);
    
    // 3. Adicionar novas opções
    for (const option of data.options || []) {
      await await db.promise().execute(
        'INSERT INTO menu_options (menu_id, option_id, title, next_menu, handler, agent_phone, config_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          menuId,
          option.id,
          option.title,
          option.next_menu || null,
          option.handler || null,
          option.agent_phone || null,
          option.config_key || null
        ]
      );
    }
    
    // 4. Atualizar em memória
    menus[key] = data;
    
    console.log(`Menu '${key}' salvo com sucesso (${data.options?.length || 0} opções)`);
    return true;
  } catch (error) {
    console.error(`Erro ao salvar menu '${key}':`, error);
    return false;
  }
}

/**
 * Retorna todos os menus
 * @returns {Object} - Objeto com todos os menus
 */
function getMenus() {
  // Se os menus ainda não foram carregados, retornar pelo menos os padrões
  if (Object.keys(menus).length === 0) {
    menus = createDefaultMenus();
  }
  
  return menus;
}

/**
 * Retorna um menu específico
 * @param {String} key - Chave do menu
 * @returns {Object|null} - Objeto do menu ou null se não existir
 */
function getMenu(key) {
  // Se os menus ainda não foram carregados, retornar pelo menos os padrões
  if (Object.keys(menus).length === 0) {
    menus = createDefaultMenus();
  }
  
  return menus[key] || null;
}

// Exportar funções
module.exports = {
  loadMenus,
  saveMenu,
  getMenus,
  getMenu
};