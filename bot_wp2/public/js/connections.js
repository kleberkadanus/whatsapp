/**
 * connections.js - Funcionalidades para a página de Gerenciamento de Conexões
 */

// Variáveis globais
let allConnections = [];
let currentConnectionId = null;
let qrCodeModal = null;
let addConnectionModal = null;
let confirmDisconnectModal = null;
let confirmDeleteModal = null;
let qrCodeRefreshInterval = null;
let qrCodeTimeoutId = null;

// Inicializar página quando o documento estiver carregado
document.addEventListener('DOMContentLoaded', function() {
  // Inicializar apenas se estiver na página de conexões
  if (document.getElementById('connections-page')) {
    initConnectionsPage();
  }
});

/**
 * Inicializa a página de gerenciamento de conexões
 */
function initConnectionsPage() {
  // Inicializar modais
  qrCodeModal = new bootstrap.Modal(document.getElementById('qrCodeModal'));
  addConnectionModal = new bootstrap.Modal(document.getElementById('addConnectionModal'));
  confirmDisconnectModal = new bootstrap.Modal(document.getElementById('confirmDisconnectModal'));
  confirmDeleteModal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
  
  // Carregar conexões
  loadConnections();
  
  // Configurar manipuladores de eventos
  setupConnectionsEventHandlers();
  
  // Verificar status ao carregar a página
  checkConnectionsStatus();
}

/**
 * Configura manipuladores de eventos para a página de conexões
 */
function setupConnectionsEventHandlers() {
  // Botão de atualizar conexões
  document.getElementById('refresh-connections-btn').addEventListener('click', loadConnections);
  
  // Botão de adicionar conexão
  document.getElementById('add-connection-btn').addEventListener('click', showAddConnectionModal);
  
  // Botão de iniciar conexão
  document.getElementById('start-connection-btn').addEventListener('click', startNewConnection);
  
  // Botão de atualizar QR Code
  document.getElementById('refresh-qr-btn').addEventListener('click', refreshQRCode);
  
  // Botão de desconectar
  document.getElementById('disconnect-btn').addEventListener('click', showDisconnectModal);
  
  // Botão de confirmar desconexão
  document.getElementById('confirm-disconnect-btn').addEventListener('click', disconnectConnection);
  
  // Botão de excluir conexão
  document.getElementById('delete-connection-btn').addEventListener('click', showDeleteModal);
  
  // Botão de confirmar exclusão
  document.getElementById('confirm-delete-btn').addEventListener('click', deleteConnection);
  
  // Botão de renomear conexão
  document.getElementById('rename-connection-btn').addEventListener('click', renameConnection);
  
  // Botão de salvar máximo de sessões
  document.getElementById('save-max-sessions-btn').addEventListener('click', saveMaxSessions);
  
  // Botão de salvar atribuição de menus
  document.getElementById('save-menu-assignment-btn').addEventListener('click', saveMenuAssignment);
  
  // Radio buttons de atribuição de menus
  document.getElementById('menu-assignment-all').addEventListener('change', function() {
    document.getElementById('specific-menus-container').classList.add('d-none');
  });
  
  document.getElementById('menu-assignment-specific').addEventListener('change', function() {
    document.getElementById('specific-menus-container').classList.remove('d-none');
  });
  
  // Evento para tipo de conexão
  document.getElementById('new-connection-type').addEventListener('change', function() {
    const agentOptions = document.getElementById('agent-options');
    if (this.value === 'agent') {
      agentOptions.classList.remove('d-none');
    } else {
      agentOptions.classList.add('d-none');
    }
  });
  
  // Evento para quando a modal QR Code é fechada
  document.getElementById('qrCodeModal').addEventListener('hidden.bs.modal', function () {
    // Limpar intervalo e timeout
    clearInterval(qrCodeRefreshInterval);
    clearTimeout(qrCodeTimeoutId);
  });
}

/**
 * Carrega a lista de conexões
 */
function loadConnections() {
  // Mostrar loader
  const loader = document.getElementById('connections-list-loader');
  const list = document.getElementById('connections-list');
  
  loader.classList.remove('d-none');
  list.classList.add('d-none');
  
  // Fazer requisição à API
  apiRequest('/connections')
    .then(data => {
      allConnections = data.connections || [];
      renderConnectionsList();
      
      // Esconder loader e mostrar lista
      loader.classList.add('d-none');
      list.classList.remove('d-none');
      
      // Se havia uma conexão selecionada, recarregar seus detalhes
      if (currentConnectionId) {
        loadConnectionDetails(currentConnectionId);
      }
    })
    .catch(error => {
      console.error('Erro ao carregar conexões:', error);
      
      // Esconder loader e mostrar erro
      loader.classList.add('d-none');
      list.classList.remove('d-none');
      
      document.getElementById('connection-items').innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i> Erro ao carregar conexões. 
          <button class="btn btn-sm btn-danger" onclick="loadConnections()">Tentar novamente</button>
        </div>
      `;
    });
}

/**
 * Renderiza a lista de conexões
 */
function renderConnectionsList() {
  const container = document.getElementById('connection-items');
  container.innerHTML = '';
  
  // Verificar se há conexões
  if (allConnections.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4">
        <i class="fas fa-plug fa-3x mb-3 text-muted"></i>
        <h5>Nenhuma conexão encontrada</h5>
        <p class="text-muted">Clique em "Nova Conexão" para adicionar.</p>
      </div>
    `;
    return;
  }
  
  // Adicionar cada conexão
  allConnections.forEach(connection => {
    const item = document.createElement('a');
    item.href = '#';
    item.className = `list-group-item list-group-item-action d-flex justify-content-between align-items-center ${connection.id === currentConnectionId ? 'active' : ''}`;
    item.setAttribute('data-connection-id', connection.id);
    
    // Status com cor correspondente
    let statusBadge = '';
    switch (connection.status) {
      case 'connected':
        statusBadge = '<span class="badge bg-success">Conectado</span>';
        break;
      case 'disconnected':
        statusBadge = '<span class="badge bg-danger">Desconectado</span>';
        break;
      case 'connecting':
        statusBadge = '<span class="badge bg-warning">Conectando</span>';
        break;
      default:
        statusBadge = `<span class="badge bg-secondary">${connection.status}</span>`;
    }
    
    // Nome e tipo
    let typeIcon = connection.type === 'bot' ? 'fa-robot' : 'fa-headset';
    
    item.innerHTML = `
      <div>
        <i class="fas ${typeIcon} me-2"></i>
        <span>${connection.name || 'Conexão ' + connection.id}</span>
      </div>
      ${statusBadge}
    `;
    
    // Adicionar evento de clique
    item.addEventListener('click', function(e) {
      e.preventDefault();
      
      // Remover classe ativa de todos os itens
      document.querySelectorAll('#connection-items .list-group-item').forEach(el => {
        el.classList.remove('active');
      });
      
      // Adicionar classe ativa a este item
      this.classList.add('active');
      
      // Carregar detalhes
      loadConnectionDetails(connection.id);
    });
    
    container.appendChild(item);
  });
}

/**
 * Carrega os detalhes de uma conexão
 * @param {string} connectionId - ID da conexão
 */
function loadConnectionDetails(connectionId) {
  // Atualizar ID da conexão atual
  currentConnectionId = connectionId;
  
  // Esconder placeholder e mostrar loader
  document.getElementById('connection-details-placeholder').classList.add('d-none');
  document.getElementById('connection-details').classList.add('d-none');
  document.getElementById('connection-details-loader').classList.remove('d-none');
  
  // Buscar detalhes da conexão
  apiRequest(`/connections/${connectionId}`)
    .then(data => {
      const connection = data.connection;
      
      // Atualizar campos
      document.getElementById('connection-name').textContent = connection.name || 'Conexão ' + connection.id;
      document.getElementById('connection-phone').textContent = connection.phone || '-';
      
      // Status com cor correspondente
      let statusHtml = '';
      switch (connection.status) {
        case 'connected':
          statusHtml = '<span class="badge bg-success">Conectado</span>';
          break;
        case 'disconnected':
          statusHtml = '<span class="badge bg-danger">Desconectado</span>';
          break;
        case 'connecting':
          statusHtml = '<span class="badge bg-warning">Conectando</span>';
          break;
        default:
          statusHtml = `<span class="badge bg-secondary">${connection.status}</span>`;
      }
      document.getElementById('connection-status').innerHTML = statusHtml;
      
      // Data de conexão
      document.getElementById('connection-connected-at').textContent = 
        connection.connected_at ? formatDate(connection.connected_at, true) : '-';
      
      // Dados do dispositivo
      document.getElementById('connection-device').textContent = 
        connection.device_info || '-';
      
      // Estatísticas
      document.getElementById('connection-messages-sent').textContent = 
        data.stats?.messages_sent || 0;
      document.getElementById('connection-messages-received').textContent = 
        data.stats?.messages_received || 0;
      document.getElementById('connection-sessions').textContent = 
        data.stats?.sessions || 0;
      document.getElementById('connection-schedules').textContent = 
        data.stats?.schedules || 0;
      
      // Campos de configuração
      document.getElementById('connection-name-input').value = 
        connection.name || '';
      document.getElementById('connection-max-sessions').value = 
        connection.max_sessions || 10;
      
      // Configuração de menus
      setupMenuAssignment(connection);
      
      // Atualizar título
      document.getElementById('connection-details-title').textContent = 
        'Detalhes: ' + (connection.name || 'Conexão ' + connection.id);
      
      // Esconder loader e mostrar detalhes
      document.getElementById('connection-details-loader').classList.add('d-none');
      document.getElementById('connection-details').classList.remove('d-none');
    })
    .catch(error => {
      console.error('Erro ao carregar detalhes da conexão:', error);
      
      // Esconder loader e mostrar placeholder com erro
      document.getElementById('connection-details-loader').classList.add('d-none');
      document.getElementById('connection-details-placeholder').classList.remove('d-none');
      document.getElementById('connection-details-placeholder').innerHTML = `
        <i class="fas fa-exclamation-triangle fa-3x mb-3 text-danger"></i>
        <h5>Erro ao carregar detalhes</h5>
        <p class="text-muted">Não foi possível carregar os detalhes desta conexão.</p>
        <button class="btn btn-primary" onclick="loadConnectionDetails('${connectionId}')">
          Tentar novamente
        </button>
      `;
    });
}

/**
 * Configura as opções de atribuição de menus
 * @param {Object} connection - Dados da conexão
 */
function setupMenuAssignment(connection) {
  // Carregar menus disponíveis
  apiRequest('/menus')
    .then(data => {
      const menus = data.menus || {};
      const container = document.getElementById('menu-checkboxes');
      container.innerHTML = '';
      
      // Radio buttons para tipo de atribuição
      if (connection.all_menus) {
        document.getElementById('menu-assignment-all').checked = true;
        document.getElementById('specific-menus-container').classList.add('d-none');
      } else {
        document.getElementById('menu-assignment-specific').checked = true;
        document.getElementById('specific-menus-container').classList.remove('d-none');
      }
      
      // Adicionar checkbox para cada menu
      Object.keys(menus).sort().forEach(key => {
        const menu = menus[key];
        
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'form-check mb-2';
        
        const checked = connection.assigned_menus?.includes(key) ? 'checked' : '';
        
        checkboxDiv.innerHTML = `
          <input class="form-check-input menu-checkbox" type="checkbox" id="menu-${key}" value="${key}" ${checked}>
          <label class="form-check-label" for="menu-${key}">
            ${menu.title || key}
          </label>
        `;
        
        container.appendChild(checkboxDiv);
      });
    })
    .catch(error => {
      console.error('Erro ao carregar menus:', error);
      document.getElementById('menu-checkboxes').innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i> Erro ao carregar menus. 
          <button class="btn btn-sm btn-danger" onclick="setupMenuAssignment(${JSON.stringify(connection)})">Tentar novamente</button>
        </div>
      `;
    });
}

/**
 * Exibe modal para adicionar nova conexão
 */
function showAddConnectionModal() {
  // Limpar formulário
  document.getElementById('new-connection-name').value = '';
  document.getElementById('new-connection-type').value = 'bot';
  document.getElementById('new-connection-agent-type').value = 'commercial';
  document.getElementById('agent-options').classList.add('d-none');
  
  // Mostrar modal
  addConnectionModal.show();
}

/**
 * Inicia o processo de adicionar uma nova conexão
 */
function startNewConnection() {
  const connectionName = document.getElementById('new-connection-name').value.trim();
  const connectionType = document.getElementById('new-connection-type').value;
  const agentType = document.getElementById('new-connection-agent-type').value;
  
  // Validar nome
  if (!connectionName) {
    showAlert('Erro', 'O nome da conexão é obrigatório.');
    return;
  }
  
  // Preparar dados
  const connectionData = {
    name: connectionName,
    type: connectionType
  };
  
  // Adicionar tipo de agente, se aplicável
  if (connectionType === 'agent') {
    connectionData.agent_type = agentType;
  }
  
  // Mostrar loader no botão
  const startBtn = document.getElementById('start-connection-btn');
  const originalText = startBtn.textContent;
  startBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Criando...';
  startBtn.disabled = true;
  
  // Criar nova conexão
  apiRequest('/connections', 'POST', connectionData)
    .then(data => {
      // Fechar modal de adição
      addConnectionModal.hide();
      
      // Atualizar lista de conexões
      loadConnections();
      
      // Se a conexão for bem-sucedida e for necessário QR code, mostrar modal
      if (data.connection && data.qr_code) {
        // Configurar modal
        document.getElementById('qr-code-img').src = data.qr_code;
        
        // Mostrar modal de QR code
        qrCodeModal.show();
        
        // Configurar timeout para expiração do QR code
        qrCodeTimeoutId = setTimeout(() => {
          document.getElementById('qr-code-status').className = 'alert alert-warning';
          document.getElementById('qr-code-status').innerHTML = 'QR Code expirado. Clique em "Gerar Novo QR Code".';
        }, 60000); // 60 segundos
        
        // Configurar intervalo para verificar status
        qrCodeRefreshInterval = setInterval(() => {
          checkConnectionStatus(data.connection.id);
        }, 5000); // Verificar a cada 5 segundos
      }
    })
    .catch(error => {
      console.error('Erro ao criar conexão:', error);
      showAlert('Erro', 'Não foi possível criar a conexão. Tente novamente mais tarde.');
    })
    .finally(() => {
      // Restaurar botão
      startBtn.textContent = originalText;
      startBtn.disabled = false;
    });
}

/**
 * Verifica o status de uma conexão específica
 * @param {string} connectionId - ID da conexão
 */
function checkConnectionStatus(connectionId) {
  apiRequest(`/connections/${connectionId}/status`)
    .then(data => {
      if (data.status === 'connected') {
        // Conexão bem-sucedida, fechar modal e limpar intervalo
        clearInterval(qrCodeRefreshInterval);
        clearTimeout(qrCodeTimeoutId);
        qrCodeModal.hide();
        
        // Atualizar lista de conexões
        loadConnections();
        
        // Carregar detalhes da conexão
        loadConnectionDetails(connectionId);
        
        // Mostrar mensagem de sucesso
        showAlert('Sucesso', 'WhatsApp conectado com sucesso!');
      }
    })
    .catch(error => {
      console.error('Erro ao verificar status da conexão:', error);
    });
}

/**
 * Atualiza o QR code para uma nova tentativa de conexão
 */
function refreshQRCode() {
  // Esconder QR code e mostrar loader
  document.getElementById('qr-code-img').classList.add('d-none');
  document.getElementById('qr-code-loader').classList.remove('d-none');
  document.getElementById('qr-code-status').className = 'alert alert-info';
  document.getElementById('qr-code-status').innerHTML = '<small>Gerando novo QR Code...</small>';
  
  // Limpar timeout e intervalo anteriores
  clearInterval(qrCodeRefreshInterval);
  clearTimeout(qrCodeTimeoutId);
  
  // Gerar novo QR code
  apiRequest('/connections/qr-code', 'POST')
    .then(data => {
      if (data.qr_code) {
        // Atualizar imagem
        document.getElementById('qr-code-img').src = data.qr_code;
        
        // Mostrar QR code e esconder loader
        document.getElementById('qr-code-img').classList.remove('d-none');
        document.getElementById('qr-code-loader').classList.add('d-none');
        
        // Atualizar status
        document.getElementById('qr-code-status').className = 'alert alert-info';
        document.getElementById('qr-code-status').innerHTML = '<small>O QR Code expira em 60 segundos. Se expirar, clique em Gerar Novo QR Code.</small>';
        
        // Configurar novo timeout
        qrCodeTimeoutId = setTimeout(() => {
          document.getElementById('qr-code-status').className = 'alert alert-warning';
          document.getElementById('qr-code-status').innerHTML = 'QR Code expirado. Clique em "Gerar Novo QR Code".';
        }, 60000); // 60 segundos
        
        // Configurar novo intervalo para verificar status
        qrCodeRefreshInterval = setInterval(() => {
          checkConnectionStatus(data.connection_id);
        }, 5000); // Verificar a cada 5 segundos
      }
    })
    .catch(error => {
      console.error('Erro ao gerar QR code:', error);
      
      // Mostrar erro
      document.getElementById('qr-code-status').className = 'alert alert-danger';
      document.getElementById('qr-code-status').innerHTML = 'Erro ao gerar QR Code. Tente novamente.';
      
      // Esconder loader e mostrar QR code (mesmo que antigo)
      document.getElementById('qr-code-loader').classList.add('d-none');
      document.getElementById('qr-code-img').classList.remove('d-none');
    });
}

/**
 * Exibe modal para confirmar desconexão
 */
function showDisconnectModal() {
  if (!currentConnectionId) {
    return;
  }
  
  // Buscar conexão atual
  const connection = allConnections.find(c => c.id === currentConnectionId);
  if (!connection) {
    return;
  }
  
  // Atualizar nome da conexão na modal
  document.getElementById('disconnect-connection-name').textContent = connection.name || 'Conexão ' + connection.id;
  
  // Mostrar modal
  confirmDisconnectModal.show();
}

/**
 * Desconecta a conexão atual
 */
function disconnectConnection() {
  if (!currentConnectionId) {
    return;
  }
  
  // Mostrar loader no botão
  const disconnectBtn = document.getElementById('confirm-disconnect-btn');
  const originalText = disconnectBtn.textContent;
  disconnectBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Desconectando...';
  disconnectBtn.disabled = true;
  
  // Enviar requisição para desconectar
  apiRequest(`/connections/${currentConnectionId}/disconnect`, 'POST')
    .then(data => {
      // Fechar modal
      confirmDisconnectModal.hide();
      
      // Atualizar lista de conexões
      loadConnections();
      
      // Mostrar mensagem de sucesso
      showAlert('Sucesso', 'WhatsApp desconectado com sucesso!');
    })
    .catch(error => {
      console.error('Erro ao desconectar:', error);
      showAlert('Erro', 'Não foi possível desconectar o WhatsApp. Tente novamente mais tarde.');
    })
    .finally(() => {
      // Restaurar botão
      disconnectBtn.textContent = originalText;
      disconnectBtn.disabled = false;
    });
}

/**
 * Exibe modal para confirmar exclusão
 */
function showDeleteModal() {
  if (!currentConnectionId) {
    return;
  }
  
  // Buscar conexão atual
  const connection = allConnections.find(c => c.id === currentConnectionId);
  if (!connection) {
    return;
  }
  
  // Atualizar nome da conexão na modal
  document.getElementById('delete-connection-name').textContent = connection.name || 'Conexão ' + connection.id;
  
  // Mostrar modal
  confirmDeleteModal.show();
}

/**
 * Exclui a conexão atual
 */
function deleteConnection() {
  if (!currentConnectionId) {
    return;
  }
  
  // Mostrar loader no botão
  const deleteBtn = document.getElementById('confirm-delete-btn');
  const originalText = deleteBtn.textContent;
  deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Excluindo...';
  deleteBtn.disabled = true;
  
  // Enviar requisição para excluir
  apiRequest(`/connections/${currentConnectionId}`, 'DELETE')
    .then(data => {
      // Fechar modal
      confirmDeleteModal.hide();
      
      // Resetar ID da conexão atual
      currentConnectionId = null;
      
      // Esconder detalhes e mostrar placeholder
      document.getElementById('connection-details').classList.add('d-none');
      document.getElementById('connection-details-placeholder').classList.remove('d-none');
      
      // Atualizar lista de conexões
      loadConnections();
      
      // Mostrar mensagem de sucesso
      showAlert('Sucesso', 'Conexão excluída com sucesso!');
    })
    .catch(error => {
      console.error('Erro ao excluir conexão:', error);
      showAlert('Erro', 'Não foi possível excluir a conexão. Tente novamente mais tarde.');
    })
    .finally(() => {
      // Restaurar botão
      deleteBtn.textContent = originalText;
      deleteBtn.disabled = false;
    });
}

/**
 * Renomeia a conexão atual
 */
function renameConnection() {
  if (!currentConnectionId) {
    return;
  }
  
  const newName = document.getElementById('connection-name-input').value.trim();
  
  // Validar nome
  if (!newName) {
    showAlert('Erro', 'O nome da conexão é obrigatório.');
    return;
  }
  
  // Mostrar loader no botão
  const renameBtn = document.getElementById('rename-connection-btn');
  const originalHTML = renameBtn.innerHTML;
  renameBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
  renameBtn.disabled = true;
  
  // Enviar requisição para renomear
  apiRequest(`/connections/${currentConnectionId}/rename`, 'POST', { name: newName })
    .then(data => {
      // Atualizar na interface
      document.getElementById('connection-name').textContent = newName;
      document.getElementById('connection-details-title').textContent = 'Detalhes: ' + newName;
      
      // Atualizar na lista
      const listItem = document.querySelector(`.list-group-item[data-connection-id="${currentConnectionId}"] span`);
      if (listItem) {
        listItem.textContent = newName;
      }
      
      // Atualizar no cache
      const connection = allConnections.find(c => c.id === currentConnectionId);
      if (connection) {
        connection.name = newName;
      }
      
      // Mostrar mensagem de sucesso
      showAlert('Sucesso', 'Conexão renomeada com sucesso!');
    })
    .catch(error => {
      console.error('Erro ao renomear conexão:', error);
      showAlert('Erro', 'Não foi possível renomear a conexão. Tente novamente mais tarde.');
    })
    .finally(() => {
      // Restaurar botão
      renameBtn.innerHTML = originalHTML;
      renameBtn.disabled = false;
    });
}

/**
 * Salva o número máximo de sessões para a conexão atual
 */
function saveMaxSessions() {
  if (!currentConnectionId) {
    return;
  }
  
  const maxSessions = parseInt(document.getElementById('connection-max-sessions').value);
  
  // Validar valor
  if (isNaN(maxSessions) || maxSessions < 1) {
    showAlert('Erro', 'O número máximo de sessões deve ser maior que zero.');
    return;
  }
  
  // Mostrar loader no botão
  const saveBtn = document.getElementById('save-max-sessions-btn');
  const originalHTML = saveBtn.innerHTML;
  saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
  saveBtn.disabled = true;
  
  // Enviar requisição para atualizar
  apiRequest(`/connections/${currentConnectionId}/config`, 'POST', { max_sessions: maxSessions })
    .then(data => {
      // Mostrar mensagem de sucesso
      showAlert('Sucesso', 'Configuração salva com sucesso!');
    })
    .catch(error => {
      console.error('Erro ao salvar configuração:', error);
      showAlert('Erro', 'Não foi possível salvar a configuração. Tente novamente mais tarde.');
    })
    .finally(() => {
      // Restaurar botão
      saveBtn.innerHTML = originalHTML;
      saveBtn.disabled = false;
    });
}

/**
 * Salva a atribuição de menus para a conexão atual
 */
function saveMenuAssignment() {
  if (!currentConnectionId) {
    return;
  }
  
  // Verificar tipo de atribuição
  const allMenus = document.getElementById('menu-assignment-all').checked;
  
  // Coletar menus específicos, se aplicável
  let assignedMenus = [];
  if (!allMenus) {
    document.querySelectorAll('.menu-checkbox:checked').forEach(checkbox => {
      assignedMenus.push(checkbox.value);
    });
  }
  
  // Preparar dados
  const data = {
    all_menus: allMenus,
    assigned_menus: assignedMenus
  };
  
  // Mostrar loader no botão
  const saveBtn = document.getElementById('save-menu-assignment-btn');
  const originalText = saveBtn.textContent;
  saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Salvando...';
  saveBtn.disabled = true;
  
  // Enviar requisição para atualizar
  apiRequest(`/connections/${currentConnectionId}/menus`, 'POST', data)
    .then(response => {
      // Mostrar mensagem de sucesso
      showAlert('Sucesso', 'Atribuição de menus salva com sucesso!');
    })
    .catch(error => {
      console.error('Erro ao salvar atribuição de menus:', error);
      showAlert('Erro', 'Não foi possível salvar a atribuição de menus. Tente novamente mais tarde.');
    })
    .finally(() => {
      // Restaurar botão
      saveBtn.innerHTML = originalText;
      saveBtn.disabled = false;
    });
}

/**
 * Verifica o status de todas as conexões
 */
function checkConnectionsStatus() {
  // Verificar a cada 30 segundos
  setInterval(() => {
    apiRequest('/connections/status')
      .then(data => {
        const statuses = data.statuses || {};
        
        // Atualizar status de cada conexão
        Object.keys(statuses).forEach(connectionId => {
          const status = statuses[connectionId];
          
          // Atualizar no cache
          const connection = allConnections.find(c => c.id === connectionId);
          if (connection) {
            connection.status = status;
          }
          
          // Atualizar na interface
          const listItem = document.querySelector(`.list-group-item[data-connection-id="${connectionId}"]`);
          if (listItem) {
            // Remover badges existentes
            const existingBadge = listItem.querySelector('.badge');
            if (existingBadge) {
              existingBadge.remove();
            }
            
            // Adicionar nova badge
            let statusBadge = '';
            switch (status) {
              case 'connected':
                statusBadge = '<span class="badge bg-success">Conectado</span>';
                break;
              case 'disconnected':
                statusBadge = '<span class="badge bg-danger">Desconectado</span>';
                break;
              case 'connecting':
                statusBadge = '<span class="badge bg-warning">Conectando</span>';
                break;
              default:
                statusBadge = `<span class="badge bg-secondary">${status}</span>`;
            }
            
            listItem.insertAdjacentHTML('beforeend', statusBadge);
          }
          
          // Se for a conexão atual, atualizar os detalhes
          if (connectionId === currentConnectionId) {
            document.getElementById('connection-status').innerHTML = statusBadge;
          }
        });
      })
      .catch(error => {
        console.error('Erro ao verificar status das conexões:', error);
      });
  }, 30000);
}