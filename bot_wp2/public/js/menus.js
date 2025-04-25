/**
 * menus.js - Funcionalidades para a página de Gerenciamento de Menus
 */

// Variáveis globais
let allMenus = {};
let currentMenuKey = null;
let menuTree = null;
let addMenuModal = null;
let deleteMenuModal = null;
let allAgents = [];
let isDragging = false;

// Inicializar página quando o documento estiver carregado
document.addEventListener('DOMContentLoaded', function() {
  // Inicializar apenas se estiver na página de menus
  if (document.getElementById('menus-page')) {
    initMenusPage();
  }
});

/**
 * Inicializa a página de gerenciamento de menus
 */
function initMenusPage() {
  // Inicializar modais
  addMenuModal = new bootstrap.Modal(document.getElementById('addMenuModal'));
  deleteMenuModal = new bootstrap.Modal(document.getElementById('deleteMenuModal'));
  
  // Carregar menus
  loadMenus();
  
  // Carregar agentes
  loadAgents();
  
  // Configurar manipuladores de eventos
  setupMenusEventHandlers();
}

/**
 * Configura manipuladores de eventos para a página de menus
 */
function setupMenusEventHandlers() {
  // Botão de adicionar menu
  document.getElementById('add-menu-btn').addEventListener('click', showAddMenuModal);
  
  // Botão de confirmar adição de menu
  document.getElementById('add-menu-confirm-btn').addEventListener('click', addNewMenu);
  
  // Botão de refresh de menus
  document.getElementById('refresh-menus-btn').addEventListener('click', loadMenus);
  
  // Formulário de menu
  document.getElementById('menu-form').addEventListener('submit', function(e) {
    e.preventDefault();
    saveMenuChanges();
  });
  
  // Botão de adicionar opção
  document.getElementById('add-option-btn').addEventListener('click', addMenuOption);
  
  // Botão de excluir menu
  document.getElementById('delete-menu-btn').addEventListener('click', showDeleteMenuModal);
  
  // Botão de confirmar exclusão
  document.getElementById('delete-menu-confirm-btn').addEventListener('click', deleteCurrentMenu);
}

/**
 * Carrega todos os menus do sistema
 */
function loadMenus() {
  // Mostrar loader
  document.getElementById('menu-tree-loader').classList.remove('d-none');
  document.getElementById('menu-tree').classList.add('d-none');
  
  // Carrega os menus via API
  apiRequest('/menus')
    .then(data => {
      allMenus = data.menus || {};
      buildMenuTree();
      
      // Esconder loader
      document.getElementById('menu-tree-loader').classList.add('d-none');
      document.getElementById('menu-tree').classList.remove('d-none');
      
      // Se um menu estava selecionado anteriormente, carregar novamente
      if (currentMenuKey && allMenus[currentMenuKey]) {
        loadMenuEditor(currentMenuKey);
      }
    })
    .catch(error => {
      console.error('Erro ao carregar menus:', error);
      showAlert('Erro', 'Não foi possível carregar os menus. Tente novamente mais tarde.');
      
      // Esconder loader e mostrar mensagem de erro
      document.getElementById('menu-tree-loader').classList.add('d-none');
      document.getElementById('menu-tree').classList.remove('d-none');
      document.getElementById('menu-tree').innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i> Erro ao carregar menus. 
          <button class="btn btn-sm btn-danger" onclick="loadMenus()">Tentar novamente</button>
        </div>
      `;
    });
}

/**
 * Constrói a árvore de menus
 */
function buildMenuTree() {
  const treeContainer = document.getElementById('menu-tree');
  treeContainer.innerHTML = '';
  
  // Criar estrutura em árvore
  const menuList = document.createElement('ul');
  menuList.className = 'list-group menu-tree-list';
  
  // Adicionar menu principal primeiro
  if (allMenus['main']) {
    const mainItem = createMenuTreeItem('main', allMenus['main'].title, true);
    menuList.appendChild(mainItem);
  }
  
  // Adicionar outros menus em ordem alfabética
  const otherMenus = Object.keys(allMenus)
    .filter(key => key !== 'main')
    .sort();
  
  otherMenus.forEach(key => {
    const menu = allMenus[key];
    const item = createMenuTreeItem(key, menu.title, false);
    menuList.appendChild(item);
  });
  
  treeContainer.appendChild(menuList);
  
  // Atualizar seletores de próximo menu
  updateNextMenuSelectors();
}

/**
 * Cria um item da árvore de menus
 * @param {string} key - Chave do menu
 * @param {string} title - Título do menu
 * @param {boolean} isMain - Se é o menu principal
 * @returns {HTMLElement} Elemento do item
 */
function createMenuTreeItem(key, title, isMain) {
  const item = document.createElement('li');
  item.className = 'list-group-item menu-tree-item';
  item.setAttribute('data-menu-key', key);
  
  // Adicionar ícone e título
  const icon = isMain ? 'fa-home' : 'fa-list';
  const className = isMain ? 'text-primary' : '';
  item.innerHTML = `
    <div class="d-flex align-items-center ${className}">
      <i class="fas ${icon} me-2"></i>
      <span class="menu-tree-title">${title || key}</span>
    </div>
  `;
  
  // Adicionar evento de clique
  item.addEventListener('click', function() {
    // Remover classe ativa de todos os itens
    document.querySelectorAll('.menu-tree-item').forEach(el => {
      el.classList.remove('active');
    });
    
    // Adicionar classe ativa a este item
    this.classList.add('active');
    
    // Carregar editor para este menu
    loadMenuEditor(key);
  });
  
  return item;
}

/**
 * Atualiza os seletores de próximo menu em todas as opções
 */
function updateNextMenuSelectors() {
  const selectors = document.querySelectorAll('.option-next-menu');
  
  selectors.forEach(selector => {
    const currentValue = selector.value;
    
    // Limpar opções
    selector.innerHTML = '<option value="">Nenhum (finalizar ou depende da ação)</option>';
    
    // Adicionar todos os menus como opções
    Object.keys(allMenus).sort().forEach(key => {
      const selected = key === currentValue ? 'selected' : '';
      selector.insertAdjacentHTML('beforeend', `
        <option value="${key}" ${selected}>${allMenus[key].title || key}</option>
      `);
    });
  });
}

/**
 * Carrega o editor para um menu específico
 * @param {string} menuKey - Chave do menu
 */
function loadMenuEditor(menuKey) {
  // Atualizar menu atual
  currentMenuKey = menuKey;
  
  // Esconder placeholder e mostrar loader
  document.getElementById('menu-editor-placeholder').classList.add('d-none');
  document.getElementById('menu-editor-form').classList.add('d-none');
  document.getElementById('menu-editor-loader').classList.remove('d-none');
  
  // Buscar dados detalhados do menu
  apiRequest(`/menus/${menuKey}`)
    .then(data => {
      const menu = data.menu;
      
      // Preencher formulário
      document.getElementById('menu-id').value = menu.id || '';
      document.getElementById('menu-key').value = menuKey;
      document.getElementById('menu-title').value = menu.title || '';
      document.getElementById('menu-message').value = menu.message || '';
      
      // Atualizar título do editor
      document.getElementById('menu-editor-title').textContent = `Editor de Menu: ${menu.title || menuKey}`;
      
      // Limpar container de opções
      const optionsContainer = document.getElementById('menu-options-container');
      optionsContainer.innerHTML = '';
      
      // Adicionar opções
      if (menu.options && menu.options.length > 0) {
        menu.options.forEach(option => {
          addMenuOption(null, option);
        });
      }
      
      // Mostrar editor e esconder loader
      document.getElementById('menu-editor-loader').classList.add('d-none');
      document.getElementById('menu-editor-form').classList.remove('d-none');
      
      // Inicializar Sortable.js para arrastar e soltar opções
      initSortable();
    })
    .catch(error => {
      console.error('Erro ao carregar menu:', error);
      showAlert('Erro', 'Não foi possível carregar os detalhes do menu. Tente novamente mais tarde.');
      
      // Esconder loader e mostrar placeholder
      document.getElementById('menu-editor-loader').classList.add('d-none');
      document.getElementById('menu-editor-placeholder').classList.remove('d-none');
    });
}

/**
 * Inicializa o Sortable.js para arrastar e soltar opções
 */
function initSortable() {
  // Verificar se a biblioteca Sortable.js está disponível
  if (typeof Sortable !== 'undefined') {
    const optionsContainer = document.getElementById('menu-options-container');
    
    // Inicializar Sortable
    Sortable.create(optionsContainer, {
      handle: '.menu-option-drag-handle',
      animation: 150,
      onStart: function() {
        isDragging = true;
      },
      onEnd: function() {
        isDragging = false;
        // Atualizar IDs após reordenação
        updateOptionIds();
      }
    });
  } else {
    console.warn('Sortable.js não encontrado. A funcionalidade de arrastar e soltar não estará disponível.');
  }
}

/**
 * Atualiza os IDs das opções após reordenação
 */
function updateOptionIds() {
  const options = document.querySelectorAll('.menu-option');
  
  options.forEach((option, index) => {
    option.querySelector('.option-id').value = index + 1;
  });
}

/**
 * Adiciona uma nova opção ao menu atual
 * @param {Event} event - Evento de clique (opcional)
 * @param {Object} optionData - Dados da opção (opcional, para carregamento)
 */
function addMenuOption(event, optionData = null) {
  // Clonar template
  const template = document.getElementById('menu-option-template');
  const newOption = document.importNode(template.content, true).children[0];
  
  // Preencher com dados, se fornecidos
  if (optionData) {
    newOption.querySelector('.option-id').value = optionData.id;
    newOption.querySelector('.option-title').textContent = optionData.title;
    newOption.querySelector('.option-title-input').value = optionData.title;
    
    const handlerSelect = newOption.querySelector('.option-handler');
    if (optionData.handler) {
      handlerSelect.value = optionData.handler;
      // Configurar container de configuração específica do handler
      setupHandlerConfig(newOption, optionData.handler, optionData);
    }
    
    const nextMenuSelect = newOption.querySelector('.option-next-menu');
    if (optionData.next_menu) {
      nextMenuSelect.value = optionData.next_menu;
    }
  } else {
    // Nova opção: definir próximo ID disponível
    const options = document.querySelectorAll('.menu-option');
    const nextId = options.length + 1;
    newOption.querySelector('.option-id').value = nextId;
  }
  
  // Adicionar evento para remover a opção
  newOption.querySelector('.remove-option-btn').addEventListener('click', function() {
    if (!isDragging) {
      removeMenuOption(this);
    }
  });
  
  // Adicionar evento para atualizar título enquanto digita
  newOption.querySelector('.option-title-input').addEventListener('input', function() {
    this.closest('.menu-option').querySelector('.option-title').textContent = this.value || 'Nova Opção';
  });
  
  // Adicionar evento para configurar handler específico
  newOption.querySelector('.option-handler').addEventListener('change', function() {
    setupHandlerConfig(newOption, this.value);
  });
  
  // Adicionar ao container
  document.getElementById('menu-options-container').appendChild(newOption);
  
  // Atualizar seletores de próximo menu
  updateNextMenuSelectors();
}

/**
 * Configura o container de configuração específica do handler
 * @param {HTMLElement} optionElement - Elemento da opção
 * @param {string} handler - Tipo de handler
 * @param {Object} data - Dados da opção (opcional)
 */
function setupHandlerConfig(optionElement, handler, data = null) {
  const configContainer = optionElement.querySelector('.option-handler-config');
  const nextMenuContainer = optionElement.querySelector('.option-next-menu-container');
  
  // Limpar container
  configContainer.innerHTML = '';
  
  // Mostrar/esconder container de próximo menu
  if (handler === 'forward' || handler === 'startScheduling' || handler === 'sendPixKey' || handler === 'listInvoices') {
    // Handlers que não precisam de próximo menu
    nextMenuContainer.classList.add('d-none');
  } else {
    nextMenuContainer.classList.remove('d-none');
  }
  
  // Configuração específica para encaminhamento
  if (handler === 'forward') {
    const template = document.getElementById('forward-handler-config');
    const config = document.importNode(template.content, true);
    
    // Preencher select de agentes
    const agentSelect = config.querySelector('.option-agent');
    
    // Limpar opções
    agentSelect.innerHTML = '<option value="">Selecione um atendente</option>';
    
    // Adicionar agentes como opções
    allAgents.forEach(agent => {
      const selected = data && data.agent_phone === agent.phone ? 'selected' : '';
      agentSelect.insertAdjacentHTML('beforeend', `
        <option value="${agent.phone}" ${selected}>${agent.name} (${agent.phone})</option>
      `);
    });
    
    // Adicionar opção para usar configuração
    agentSelect.insertAdjacentHTML('beforeend', `
      <option value="commercial_agent" ${data && data.config_key === 'commercial_agent' ? 'selected' : ''}>Comercial (configuração)</option>
      <option value="support_agent" ${data && data.config_key === 'support_agent' ? 'selected' : ''}>Suporte (configuração)</option>
      <option value="financial_agent" ${data && data.config_key === 'financial_agent' ? 'selected' : ''}>Financeiro (configuração)</option>
    `);
    
    configContainer.appendChild(config);
  }
}

/**
 * Remove uma opção do menu
 * @param {HTMLElement} button - Botão de remoção clicado
 */
function removeMenuOption(button) {
  const option = button.closest('.menu-option');
  
  // Confirmar remoção
  if (confirm('Tem certeza que deseja remover esta opção?')) {
    option.remove();
    updateOptionIds();
  }
}

/**
 * Carrega a lista de agentes
 */
function loadAgents() {
  apiRequest('/agents')
    .then(data => {
      allAgents = data.agents || [];
    })
    .catch(error => {
      console.error('Erro ao carregar agentes:', error);
      allAgents = [];
    });
}

/**
 * Exibe modal para adicionar novo menu
 */
function showAddMenuModal() {
  // Limpar formulário
  document.getElementById('new-menu-key').value = '';
  document.getElementById('new-menu-title').value = '';
  document.getElementById('new-menu-message').value = '';
  
  // Mostrar modal
  addMenuModal.show();
}

/**
 * Adiciona um novo menu
 */
function addNewMenu() {
  const menuKey = document.getElementById('new-menu-key').value.trim();
  const menuTitle = document.getElementById('new-menu-title').value.trim();
  const menuMessage = document.getElementById('new-menu-message').value.trim();
  
  // Validar chave
  if (!menuKey) {
    showAlert('Erro', 'A chave do menu é obrigatória.');
    return;
  }
  
  // Validar formato da chave
  if (!/^[a-z0-9_]+$/.test(menuKey)) {
    showAlert('Erro', 'A chave do menu deve conter apenas letras minúsculas, números e underscore (_).');
    return;
  }
  
  // Verificar se a chave já existe
  if (allMenus[menuKey]) {
    showAlert('Erro', `O menu "${menuKey}" já existe. Escolha outra chave.`);
    return;
  }
  
  // Validar título
  if (!menuTitle) {
    showAlert('Erro', 'O título do menu é obrigatório.');
    return;
  }
  
  // Criar novo menu
  const newMenu = {
    title: menuTitle,
    message: menuMessage,
    options: []
  };
  
  // Mostrar loader no botão
  const addBtn = document.getElementById('add-menu-confirm-btn');
  const originalText = addBtn.innerHTML;
  addBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adicionando...';
  addBtn.disabled = true;
  
  // Salvar no servidor
  apiRequest('/menus', 'POST', { key: menuKey, menu: newMenu })
    .then(data => {
      // Fechar modal
      addMenuModal.hide();
      
      // Atualizar menus
      loadMenus();
      
      // Mostrar mensagem de sucesso
      showAlert('Sucesso', `Menu "${menuTitle}" adicionado com sucesso!`);
      
      // Carregar editor para o novo menu
      setTimeout(() => {
        document.querySelector(`.menu-tree-item[data-menu-key="${menuKey}"]`)?.click();
      }, 500);
    })
    .catch(error => {
      console.error('Erro ao adicionar menu:', error);
      showAlert('Erro', 'Não foi possível adicionar o menu. Tente novamente mais tarde.');
    })
    .finally(() => {
      // Restaurar botão
      addBtn.innerHTML = originalText;
      addBtn.disabled = false;
    });
}

/**
 * Exibe modal para confirmar exclusão do menu atual
 */
function showDeleteMenuModal() {
  if (!currentMenuKey) {
    return;
  }
  
  // Não permitir excluir o menu principal
  if (currentMenuKey === 'main') {
    showAlert('Aviso', 'O menu principal não pode ser excluído.');
    return;
  }
  
  // Atualizar nome do menu
  document.getElementById('delete-menu-name').textContent = allMenus[currentMenuKey]?.title || currentMenuKey;
  
  // Mostrar modal
  deleteMenuModal.show();
}

/**
 * Exclui o menu atual
 */
function deleteCurrentMenu() {
  if (!currentMenuKey || currentMenuKey === 'main') {
    return;
  }
  
  // Mostrar loader no botão
  const deleteBtn = document.getElementById('delete-menu-confirm-btn');
  const originalText = deleteBtn.innerHTML;
  deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Excluindo...';
  deleteBtn.disabled = true;
  
  // Excluir menu
  apiRequest(`/menus/${currentMenuKey}`, 'DELETE')
    .then(data => {
      // Fechar modal
      deleteMenuModal.hide();
      
      // Atualizar menus
      loadMenus();
      
      // Mostrar mensagem de sucesso
      showAlert('Sucesso', `Menu "${currentMenuKey}" excluído com sucesso!`);
      
      // Resetar menu atual
      currentMenuKey = null;
      
      // Mostrar placeholder
      document.getElementById('menu-editor-form').classList.add('d-none');
      document.getElementById('menu-editor-placeholder').classList.remove('d-none');
    })
    .catch(error => {
      console.error('Erro ao excluir menu:', error);
      showAlert('Erro', 'Não foi possível excluir o menu. Verifique se ele não está sendo referenciado por outros menus.');
    })
    .finally(() => {
      // Restaurar botão
      deleteBtn.innerHTML = originalText;
      deleteBtn.disabled = false;
    });
}

/**
 * Salva as alterações do menu atual
 */
function saveMenuChanges() {
  if (!currentMenuKey) {
    return;
  }
  
  // Coletar dados do formulário
  const menuId = document.getElementById('menu-id').value;
  const menuKey = document.getElementById('menu-key').value;
  const menuTitle = document.getElementById('menu-title').value;
  const menuMessage = document.getElementById('menu-message').value;
  
  // Validar título
  if (!menuTitle) {
    showAlert('Erro', 'O título do menu é obrigatório.');
    return;
  }
  
  // Coletar opções
  const options = [];
  const optionElements = document.querySelectorAll('.menu-option');
  
  optionElements.forEach(optionEl => {
    const id = parseInt(optionEl.querySelector('.option-id').value);
    const title = optionEl.querySelector('.option-title-input').value;
    const handler = optionEl.querySelector('.option-handler').value;
    const nextMenu = optionEl.querySelector('.option-next-menu').value;
    
    // Validar título da opção
    if (!title) {
      showAlert('Erro', `O título da opção ${id} é obrigatório.`);
      return;
    }
    
    // Criar objeto da opção
    const option = {
      id,
      title,
      handler: handler || null,
      next_menu: nextMenu || null
    };
    
    // Adicionar configuração específica do handler
    if (handler === 'forward') {
      const agentSelect = optionEl.querySelector('.option-agent');
      const agentValue = agentSelect?.value;
      
      if (agentValue) {
        if (['commercial_agent', 'support_agent', 'financial_agent'].includes(agentValue)) {
          option.config_key = agentValue;
        } else {
          option.agent_phone = agentValue;
        }
      }
    }
    
    options.push(option);
  });
  
  // Ordenar opções por ID
  options.sort((a, b) => a.id - b.id);
  
  // Construir objeto do menu
  const menuData = {
    id: menuId,
    title: menuTitle,
    message: menuMessage,
    options
  };
  
  // Mostrar loader
  const submitBtn = document.querySelector('#menu-form button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Salvando...';
  submitBtn.disabled = true;
  
  // Salvar no servidor
  apiRequest(`/menus/${menuKey}`, 'PUT', { menu: menuData })
    .then(data => {
      // Atualizar título na árvore
      const treeItem = document.querySelector(`.menu-tree-item[data-menu-key="${menuKey}"]`);
      if (treeItem) {
        treeItem.querySelector('.menu-tree-title').textContent = menuTitle || menuKey;
      }
      
      // Atualizar cache de menus
      if (allMenus[menuKey]) {
        allMenus[menuKey].title = menuTitle;
        allMenus[menuKey].message = menuMessage;
        allMenus[menuKey].options = options;
      }
      
      // Atualizar título do editor
      document.getElementById('menu-editor-title').textContent = `Editor de Menu: ${menuTitle || menuKey}`;
      
      // Mostrar mensagem de sucesso
      showAlert('Sucesso', `Menu "${menuTitle}" salvo com sucesso!`);
      
      // Atualizar seletores de próximo menu
      updateNextMenuSelectors();
    })
    .catch(error => {
      console.error('Erro ao salvar menu:', error);
      showAlert('Erro', 'Não foi possível salvar o menu. Tente novamente mais tarde.');
    })
    .finally(() => {
      // Restaurar botão
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    });
}