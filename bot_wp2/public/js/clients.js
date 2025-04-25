/**
 * clients.js - Funcionalidades para a página de Gerenciamento de Clientes
 */

// Variáveis globais
let currentPage = 1;
let totalPages = 1;
let pageSize = 12;
let currentFilters = {};
let currentClient = null;
let clientModal = null;
let invoiceModal = null;
let postsaleModal = null;
// URL base da API
const BASE_API_URL = '/api';

// Inicializar página quando o documento estiver carregado
document.addEventListener('DOMContentLoaded', function() {
  // Inicializar apenas se estiver na página de clientes
  if (document.getElementById('clients-page')) {
    initClientsPage();
  }
});

/**
 * Inicializa a página de clientes
 */
function initClientsPage() {
  // Inicializar modais
  clientModal = new bootstrap.Modal(document.getElementById('clientModal'));
  invoiceModal = new bootstrap.Modal(document.getElementById('invoiceModal'));
  postsaleModal = new bootstrap.Modal(document.getElementById('postsaleModal'));
  
  // Carregar clientes
  loadClients();
  
  // Configurar manipuladores de eventos
  setupClientEventHandlers();
}

/**
 * Configura manipuladores de eventos para a página de clientes
 */
function setupClientEventHandlers() {
  // Busca de clientes
  document.getElementById('search-btn').addEventListener('click', function() {
    const searchTerm = document.getElementById('client-search').value.trim();
    currentFilters.search = searchTerm || null;
    currentPage = 1;
    loadClients();
  });
  
  document.getElementById('client-search').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('search-btn').click();
    }
  });
  
  // Filtros
  document.getElementById('filter-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    currentFilters = {
      dateFrom: document.getElementById('filter-date-from').value || null,
      dateTo: document.getElementById('filter-date-to').value || null,
      interaction: document.getElementById('filter-interaction').value || null,
      status: document.getElementById('filter-status').value || null
    };
    
    currentPage = 1;
    loadClients();
  });
  
  document.getElementById('filter-form').addEventListener('reset', function() {
    setTimeout(() => {
      currentFilters = {};
      currentPage = 1;
      loadClients();
    }, 0);
  });
  
  // Adicionar novo cliente
  document.getElementById('add-client-btn').addEventListener('click', function() {
    showClientForm();
  });
  
  // Formulário de cliente
  document.getElementById('client-info-form').addEventListener('submit', function(e) {
    e.preventDefault();
    saveClientInfo();
  });
  
  // Envio de mensagem
  document.getElementById('send-message-form').addEventListener('submit', function(e) {
    e.preventDefault();
    sendClientMessage();
  });
  
  // Botões de ação na página de detalhes
  document.getElementById('start-chat-btn').addEventListener('click', function() {
    startClientChat();
  });
  
  document.getElementById('add-invoice-btn').addEventListener('click', function() {
    showInvoiceForm();
  });
  
  document.getElementById('add-invoice-btn-tab').addEventListener('click', function() {
    showInvoiceForm();
  });
  
  document.getElementById('schedule-visit-btn').addEventListener('click', function() {
    scheduleClientVisit();
  });
  
  document.getElementById('start-postsale-btn').addEventListener('click', function() {
    showPostsaleForm();
  });
  
  // Formulário de boleto
  document.getElementById('save-invoice-btn').addEventListener('click', function() {
    saveInvoice();
  });
  
  // Mudança de tipo de serviço em pós-venda
  document.getElementById('postsale-service-type').addEventListener('change', function() {
    const value = this.value;
    const otherContainer = document.getElementById('other-service-container');
    
    if (value === 'Outro') {
      otherContainer.classList.remove('d-none');
      document.getElementById('postsale-other-service').setAttribute('required', 'required');
    } else {
      otherContainer.classList.add('d-none');
      document.getElementById('postsale-other-service').removeAttribute('required');
    }
  });
  
  // Confirmar pós-venda
  document.getElementById('start-postsale-confirm-btn').addEventListener('click', function() {
    startPostsaleSurvey();
  });
}

/**
 * Carrega a lista de clientes com base nos filtros e paginação
 */
function loadClients() {
  const container = document.getElementById('clients-container');
  
  // Mostrar loader
  container.innerHTML = `
    <div class="col-12 text-center py-5">
      <div class="loader"></div>
      <p class="mt-3">Carregando clientes...</p>
    </div>
  `;
  
  // Construir parâmetros de consulta
  const params = new URLSearchParams();
  params.append('page', currentPage);
  params.append('limit', pageSize);
  
  // Adicionar filtros
  if (currentFilters.search) {
    params.append('search', currentFilters.search);
  }
  
  if (currentFilters.dateFrom) {
    params.append('dateFrom', currentFilters.dateFrom);
  }
  
  if (currentFilters.dateTo) {
    params.append('dateTo', currentFilters.dateTo);
  }
  
  if (currentFilters.interaction) {
    params.append('interaction', currentFilters.interaction);
  }
  
  if (currentFilters.status) {
    params.append('status', currentFilters.status);
  }
  
  // Fazer requisição à API
  apiRequest(`/clients?${params.toString()}`)
    .then(data => {
      // Atualizar paginação
      totalPages = Math.ceil(data.total / pageSize);
      updatePagination();
      
      // Limpar container
      container.innerHTML = '';
      
      // Verificar se há resultados
      if (!data.clients || data.clients.length === 0) {
        container.innerHTML = `
          <div class="col-12 text-center py-5">
            <i class="fas fa-search fa-3x mb-3 text-muted"></i>
            <h5>Nenhum cliente encontrado</h5>
            <p class="text-muted">Tente ajustar os filtros de busca.</p>
          </div>
        `;
        return;
      }
      
      // Renderizar cards de clientes
      data.clients.forEach(client => {
        container.appendChild(createClientCard(client));
      });
    })
    .catch(error => {
      console.error('Erro ao carregar clientes:', error);
      container.innerHTML = `
        <div class="col-12 text-center py-5">
          <i class="fas fa-exclamation-triangle fa-3x mb-3 text-danger"></i>
          <h5>Erro ao carregar clientes</h5>
          <p class="text-muted">Tente novamente mais tarde.</p>
        </div>
      `;
    });
}

/**
 * Cria um card para exibição do cliente
 * @param {Object} client - Dados do cliente
 * @returns {HTMLElement} Elemento do card
 */
function createClientCard(client) {
  // Clonar template
  const template = document.getElementById('client-card-template');
  const card = document.importNode(template.content, true).children[0];
  
  // Preencher dados
  card.querySelector('.client-name').textContent = client.name || 'Cliente sem nome';
  card.querySelector('.client-phone').textContent = client.phone;
  
  // Formatar data do último contato
  const lastContact = client.last_activity ? formatDate(client.last_activity, true) : 'Nunca';
  card.querySelector('.client-last-contact').textContent = `Último contato: ${lastContact}`;
  
  // Total de mensagens
  card.querySelector('.client-message-count').textContent = client.messages_count || 0;
  
  // Status
  const statusIcon = card.querySelector('.client-status i');
  if (client.blocked) {
    statusIcon.className = 'fas fa-circle text-danger';
    statusIcon.title = 'Bloqueado';
  } else if (client.active_session) {
    statusIcon.className = 'fas fa-circle text-success';
    statusIcon.title = 'Sessão ativa';
  } else {
    statusIcon.className = 'fas fa-circle text-secondary';
    statusIcon.title = 'Inativo';
  }
  
  // Adicionar evento de clique para abrir detalhes
  card.querySelector('.view-client-btn').addEventListener('click', function(e) {
    e.preventDefault();
    openClientDetails(client.id);
  });
  
  // Adicionar evento de clique no card inteiro
  card.addEventListener('click', function() {
    openClientDetails(client.id);
  });
  
  return card;
}

/**
 * Atualiza a paginação
 */
function updatePagination() {
  const pagination = document.getElementById('pagination');
  let html = '';
  
  // Botão anterior
  html += `
    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="${currentPage - 1}" aria-disabled="${currentPage === 1}">Anterior</a>
    </li>
  `;
  
  // Páginas
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  
  for (let i = startPage; i <= endPage; i++) {
    html += `
      <li class="page-item ${i === currentPage ? 'active' : ''}">
        <a class="page-link" href="#" data-page="${i}">${i}</a>
      </li>
    `;
  }
  
  // Botão próximo
  html += `
    <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="${currentPage + 1}" aria-disabled="${currentPage === totalPages}">Próxima</a>
    </li>
  `;
  
  // Atualizar HTML
  pagination.innerHTML = html;
  
  // Adicionar eventos de clique
  pagination.querySelectorAll('.page-link').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      
      // Verificar se o botão está desabilitado
      if (this.getAttribute('aria-disabled') === 'true') {
        return;
      }
      
      // Atualizar página atual
      currentPage = parseInt(this.getAttribute('data-page'));
      
      // Carregar clientes
      loadClients();
    });
  });
}

/**
 * Abre modal com detalhes do cliente
 * @param {number} clientId - ID do cliente
 */
function openClientDetails(clientId) {
  // Mostrar loader nos tabs
  document.getElementById('messages-history').innerHTML = `
    <div class="text-center p-5">
      <div class="loader"></div>
      <p class="mt-3">Carregando mensagens...</p>
    </div>
  `;
  
  document.getElementById('invoices-table').querySelector('tbody').innerHTML = `
    <tr>
      <td colspan="5" class="text-center">
        <div class="loader"></div>
        <p class="mt-3">Carregando boletos...</p>
      </td>
    </tr>
  `;
  
  document.getElementById('schedules-table').querySelector('tbody').innerHTML = `
    <tr>
      <td colspan="5" class="text-center">
        <div class="loader"></div>
        <p class="mt-3">Carregando agendamentos...</p>
      </td>
    </tr>
  `;
  
  document.getElementById('ratings-table').querySelector('tbody').innerHTML = `
    <tr>
      <td colspan="4" class="text-center">
        <div class="loader"></div>
        <p class="mt-3">Carregando avaliações...</p>
      </td>
    </tr>
  `;
  
  // Carregar dados do cliente
  apiRequest(`/clients/${clientId}`)
    .then(data => {
      // Salvar cliente atual
      currentClient = data.client;
      
      // Preencher formulário
      document.getElementById('client-id').value = currentClient.id;
      document.getElementById('client-name').value = currentClient.name || '';
      document.getElementById('client-phone').value = currentClient.phone;
      document.getElementById('client-email').value = currentClient.email || '';
      document.getElementById('client-address').value = currentClient.address || '';
      document.getElementById('client-complement').value = currentClient.complement || '';
      document.getElementById('client-created-at').value = formatDate(currentClient.created_at);
      document.getElementById('client-blocked').checked = currentClient.blocked || false;
      
      // Atualizar título da modal
      document.getElementById('clientModalTitle').textContent = currentClient.name || 'Detalhes do Cliente';
      
      // Preencher resumo de interações
      document.getElementById('client-messages-count').textContent = data.stats.messages_count || 0;
      document.getElementById('client-sessions-count').textContent = data.stats.sessions_count || 0;
      document.getElementById('client-schedules-count').textContent = data.stats.schedules_count || 0;
      document.getElementById('client-invoices-count').textContent = data.stats.invoices_count || 0;
      document.getElementById('client-last-activity').textContent = data.stats.last_activity ? formatDate(data.stats.last_activity, true) : '-';
      document.getElementById('client-avg-rating').textContent = data.stats.avg_rating ? data.stats.avg_rating.toFixed(1) + ' ⭐' : '-';
      
      // Carregar dados relacionados
      loadClientMessages(clientId);
      loadClientInvoices(clientId);
      loadClientSchedules(clientId);
      loadClientRatings(clientId);
      
      // Abrir modal
      clientModal.show();
    })
    .catch(error => {
      console.error('Erro ao carregar detalhes do cliente:', error);
      showAlert('Erro', 'Não foi possível carregar os detalhes do cliente. Tente novamente mais tarde.');
    });
}

/**
 * Carrega mensagens do cliente
 * @param {number} clientId - ID do cliente
 */
function loadClientMessages(clientId) {
  const container = document.getElementById('messages-history');
  
  apiRequest(`/clients/${clientId}/messages`)
    .then(data => {
      // Limpar container
      container.innerHTML = '';
      
      // Verificar se há mensagens
      if (!data.messages || data.messages.length === 0) {
        container.innerHTML = `
          <div class="text-center p-5">
            <i class="fas fa-comments fa-3x mb-3 text-muted"></i>
            <h5>Nenhuma mensagem encontrada</h5>
          </div>
        `;
        return;
      }
      
      // Renderizar mensagens
      data.messages.forEach(message => {
        container.appendChild(createMessageItem(message));
      });
      
      // Rolar para a última mensagem
      container.scrollTop = container.scrollHeight;
    })
    .catch(error => {
      console.error('Erro ao carregar mensagens:', error);
      container.innerHTML = `
        <div class="text-center p-5">
          <i class="fas fa-exclamation-triangle fa-3x mb-3 text-danger"></i>
          <h5>Erro ao carregar mensagens</h5>
        </div>
      `;
    });
}

/**
 * Cria um elemento de mensagem
 * @param {Object} message - Dados da mensagem
 * @returns {HTMLElement} Elemento da mensagem
 */
function createMessageItem(message) {
  // Clonar template
  const template = document.getElementById('message-template');
  const item = document.importNode(template.content, true).children[0];
  
  // Definir classes com base na direção
  if (message.direction === 'incoming') {
    item.classList.add('message-incoming');
  } else {
    item.classList.add('message-outgoing');
  }
  
  // Preencher conteúdo
  item.querySelector('.message-content').textContent = message.message_text;
  item.querySelector('.message-time').textContent = formatDate(message.created_at, true);
  
  return item;
}

/**
 * Carrega boletos do cliente
 * @param {number} clientId - ID do cliente
 */
function loadClientInvoices(clientId) {
  const tableBody = document.getElementById('invoices-table').querySelector('tbody');
  
  apiRequest(`/clients/${clientId}/invoices`)
    .then(data => {
      // Limpar tabela
      tableBody.innerHTML = '';
      
      // Verificar se há boletos
      if (!data.invoices || data.invoices.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center">
              <i class="fas fa-file-invoice fa-2x mb-3 text-muted"></i>
              <p>Nenhum boleto encontrado</p>
            </td>
          </tr>
        `;
        return;
      }
      
      // Renderizar boletos
      data.invoices.forEach(invoice => {
        const row = document.createElement('tr');
        
        // Status baseado no pagamento e vencimento
        let statusBadge = '';
        const dueDate = new Date(invoice.due_date);
        const now = new Date();
        
        if (invoice.paid) {
          statusBadge = '<span class="badge bg-success">Pago</span>';
        } else if (dueDate < now) {
          statusBadge = '<span class="badge bg-danger">Vencido</span>';
        } else {
          statusBadge = '<span class="badge bg-warning">Pendente</span>';
        }
        
        row.innerHTML = `
          <td>${invoice.reference || '-'}</td>
          <td>${formatDate(invoice.due_date)}</td>
          <td>R$ ${parseFloat(invoice.amount).toFixed(2)}</td>
          <td>${statusBadge}</td>
          <td>
            <div class="btn-group btn-group-sm">
              <button type="button" class="btn btn-info view-invoice-btn" data-id="${invoice.id}">
                <i class="fas fa-eye"></i>
              </button>
              <button type="button" class="btn btn-primary edit-invoice-btn" data-id="${invoice.id}">
                <i class="fas fa-edit"></i>
              </button>
              <button type="button" class="btn btn-danger delete-invoice-btn" data-id="${invoice.id}">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        `;
        
        // Adicionar eventos
        row.querySelector('.view-invoice-btn').addEventListener('click', function() {
          viewInvoice(invoice.id);
        });
        
        row.querySelector('.edit-invoice-btn').addEventListener('click', function() {
          editInvoice(invoice.id);
        });
        
        row.querySelector('.delete-invoice-btn').addEventListener('click', function() {
          deleteInvoice(invoice.id);
        });
        
        tableBody.appendChild(row);
      });
    })
    .catch(error => {
      console.error('Erro ao carregar boletos:', error);
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-danger">
            Erro ao carregar boletos. Tente novamente mais tarde.
          </td>
        </tr>
      `;
    });
}

/**
 * Carrega agendamentos do cliente
 * @param {number} clientId - ID do cliente
 */
function loadClientSchedules(clientId) {
  const tableBody = document.getElementById('schedules-table').querySelector('tbody');
  
  apiRequest(`/clients/${clientId}/schedules`)
    .then(data => {
      // Limpar tabela
      tableBody.innerHTML = '';
      
      // Verificar se há agendamentos
      if (!data.schedules || data.schedules.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center">
              <i class="fas fa-calendar fa-2x mb-3 text-muted"></i>
              <p>Nenhum agendamento encontrado</p>
            </td>
          </tr>
        `;
        return;
      }
      
      // Renderizar agendamentos
      data.schedules.forEach(schedule => {
        const row = document.createElement('tr');
        
        // Status com cor correspondente
        let statusBadge = '';
        switch (schedule.status) {
          case 'confirmed':
            statusBadge = '<span class="badge bg-success">Confirmado</span>';
            break;
          case 'pending':
            statusBadge = '<span class="badge bg-warning">Pendente</span>';
            break;
          case 'cancelled':
            statusBadge = '<span class="badge bg-danger">Cancelado</span>';
            break;
          case 'completed':
            statusBadge = '<span class="badge bg-info">Concluído</span>';
            break;
          default:
            statusBadge = `<span class="badge bg-secondary">${schedule.status}</span>`;
        }
        
        // Verificar se é passado ou futuro
        const appointmentDate = new Date(schedule.appointment_date);
        const now = new Date();
        let rowClass = '';
        
        if (schedule.status === 'confirmed' && appointmentDate < now) {
          rowClass = 'table-warning';
        }
        
        row.className = rowClass;
        row.innerHTML = `
          <td>${formatDate(schedule.appointment_date, true)}</td>
          <td>${schedule.service_type}</td>
          <td>${schedule.description || '-'}</td>
          <td>${statusBadge}</td>
          <td>
            <div class="btn-group btn-group-sm">
              <button type="button" class="btn btn-info view-schedule-btn" data-id="${schedule.id}">
                <i class="fas fa-eye"></i>
              </button>
              ${schedule.status === 'confirmed' ? `
                <button type="button" class="btn btn-success complete-schedule-btn" data-id="${schedule.id}">
                  <i class="fas fa-check"></i>
                </button>
              ` : ''}
              ${schedule.status !== 'cancelled' && schedule.status !== 'completed' ? `
                <button type="button" class="btn btn-danger cancel-schedule-btn" data-id="${schedule.id}">
                  <i class="fas fa-times"></i>
                </button>
              ` : ''}
            </div>
          </td>
        `;
        
        // Adicionar eventos
        row.querySelector('.view-schedule-btn').addEventListener('click', function() {
          viewSchedule(schedule.id);
        });
        
        const completeBtn = row.querySelector('.complete-schedule-btn');
        if (completeBtn) {
          completeBtn.addEventListener('click', function() {
            completeSchedule(schedule.id);
          });
        }
        
        const cancelBtn = row.querySelector('.cancel-schedule-btn');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', function() {
            cancelSchedule(schedule.id);
          });
        }
        
        tableBody.appendChild(row);
      });
    })
    .catch(error => {
      console.error('Erro ao carregar agendamentos:', error);
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-danger">
            Erro ao carregar agendamentos. Tente novamente mais tarde.
          </td>
        </tr>
      `;
    });
}

/**
 * Carrega avaliações do cliente
 * @param {number} clientId - ID do cliente
 */
function loadClientRatings(clientId) {
  const tableBody = document.getElementById('ratings-table').querySelector('tbody');
  
  apiRequest(`/clients/${clientId}/ratings`)
    .then(data => {
      // Limpar tabela
      tableBody.innerHTML = '';
      
      // Verificar se há avaliações
      if (!data.ratings || data.ratings.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center">
              <i class="fas fa-star fa-2x mb-3 text-muted"></i>
              <p>Nenhuma avaliação encontrada</p>
            </td>
          </tr>
        `;
        return;
      }
      
      // Renderizar avaliações
      data.ratings.forEach(rating => {
        const row = document.createElement('tr');
        
        // Criar string de estrelas
        let stars = '';
        for (let i = 1; i <= 5; i++) {
          if (i <= rating.rating_score) {
            stars += '<i class="fas fa-star text-warning"></i>';
          } else {
            stars += '<i class="far fa-star text-warning"></i>';
          }
        }
        
        row.innerHTML = `
          <td>${formatDate(rating.created_at)}</td>
          <td>${rating.menu_path || 'Atendimento'}</td>
          <td>${stars}</td>
          <td>${rating.comment || '-'}</td>
        `;
        
        tableBody.appendChild(row);
      });
    })
    .catch(error => {
      console.error('Erro ao carregar avaliações:', error);
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-danger">
            Erro ao carregar avaliações. Tente novamente mais tarde.
          </td>
        </tr>
      `;
    });
}

/**
 * Exibe formulário para adicionar novo cliente
 */
function showClientForm() {
  // Limpar formulário
  document.getElementById('client-id').value = '';
  document.getElementById('client-name').value = '';
  document.getElementById('client-phone').value = '';
  document.getElementById('client-email').value = '';
  document.getElementById('client-address').value = '';
  document.getElementById('client-complement').value = '';
  document.getElementById('client-created-at').value = '';
  document.getElementById('client-blocked').checked = false;
  
  // Atualizar título da modal
  document.getElementById('clientModalTitle').textContent = 'Novo Cliente';
  
  // Limpar outros dados
  document.getElementById('client-messages-count').textContent = '0';
  document.getElementById('client-sessions-count').textContent = '0';
  document.getElementById('client-schedules-count').textContent = '0';
  document.getElementById('client-invoices-count').textContent = '0';
  document.getElementById('client-last-activity').textContent = '-';
  document.getElementById('client-avg-rating').textContent = '-';
  
  // Limpar conteúdo das tabs
  document.getElementById('messages-history').innerHTML = `
    <div class="text-center p-5">
      <p>Nenhuma mensagem ainda</p>
    </div>
  `;
  
  document.getElementById('invoices-table').querySelector('tbody').innerHTML = `
    <tr>
      <td colspan="5" class="text-center">
        <p>Nenhum boleto ainda</p>
      </td>
    </tr>
  `;
  
  document.getElementById('schedules-table').querySelector('tbody').innerHTML = `
    <tr>
      <td colspan="5" class="text-center">
        <p>Nenhum agendamento ainda</p>
      </td>
    </tr>
  `;
  
  document.getElementById('ratings-table').querySelector('tbody').innerHTML = `
    <tr>
      <td colspan="4" class="text-center">
        <p>Nenhuma avaliação ainda</p>
      </td>
    </tr>
  `;
  
  // Ativar guia de informações
  document.getElementById('info-tab').click();
  
  // Tornar o campo de telefone editável para novos clientes
  document.getElementById('client-phone').removeAttribute('readonly');
  
  // Mostrar modal
  clientModal.show();
}

/**
 * Salva informações do cliente
 */
function saveClientInfo() {
    const clientId = document.getElementById('client-id').value;
    const formData = {
      name: document.getElementById('client-name').value,
      phone: document.getElementById('client-phone').value,
      email: document.getElementById('client-email').value,
      address: document.getElementById('client-address').value,
      complement: document.getElementById('client-complement').value,
      blocked: document.getElementById('client-blocked').checked
    };
  
    // Validar telefone
    if (!formData.phone) {
      showAlert('Erro', 'O telefone é obrigatório.');
      return;
    }
  
    // Definir endpoint e método
    const endpoint = clientId ? `/clients/${clientId}` : '/clients';
    const method   = clientId ? 'PUT' : 'POST';
  
    // Fazer requisição à API
    apiRequest(endpoint, method, formData)
      .then(data => {
        // Se for novo, atualiza o ID e bloqueia o campo
        if (!clientId && data.client && data.client.id) {
          document.getElementById('client-id').value = data.client.id;
          document.getElementById('client-phone').setAttribute('readonly', 'readonly');
        }
        // Atualiza cliente atual e recarrega lista
        if (data.client) currentClient = data.client;
        document.getElementById('clientModalTitle').textContent =
          formData.name || 'Detalhes do Cliente';
        showAlert('Sucesso', clientId ? 'Cliente atualizado!' : 'Cliente adicionado!');
        loadClients();
      })
      .catch(error => {
        console.error('Erro ao salvar cliente:', error);
        showAlert('Erro', 'Não foi possível salvar as informações. Tente novamente.');
      });
  }


/**
* Envia uma mensagem para o cliente
*/
function sendClientMessage() {
const messageInput = document.getElementById('message-input');
const message = messageInput.value.trim();

if (!message) {
return;
}

if (!currentClient) {
showAlert('Erro', 'Cliente não selecionado.');
return;
}

// Limpar input
messageInput.value = '';

// Fazer requisição à API
apiRequest(`/clients/${currentClient.id}/messages`, 'POST', { message })
.then(data => {
  // Recarregar mensagens
  loadClientMessages(currentClient.id);
})
.catch(error => {
  console.error('Erro ao enviar mensagem:', error);
  showAlert('Erro', 'Não foi possível enviar a mensagem. Tente novamente.');
});
}

/**
* Inicia chat com cliente
*/
function startClientChat() {
if (!currentClient) {
showAlert('Erro', 'Cliente não selecionado.');
return;
}

// Fazer requisição à API
apiRequest(`/clients/${currentClient.id}/start-chat`, 'POST')
.then(data => {
  showAlert('Sucesso', 'Chat iniciado. O sistema enviará uma mensagem de boas-vindas ao cliente.');
  // Ativar a aba de mensagens
  document.getElementById('messages-tab').click();
  // Recarregar mensagens
  loadClientMessages(currentClient.id);
})
.catch(error => {
  console.error('Erro ao iniciar chat:', error);
  showAlert('Erro', 'Não foi possível iniciar o chat. Tente novamente.');
});
}

/**
* Exibe formulário para adicionar/editar boleto
* @param {number} invoiceId - ID do boleto (opcional, para edição)
*/
function showInvoiceForm(invoiceId = null) {
if (!currentClient) {
showAlert('Erro', 'Cliente não selecionado.');
return;
}

// Limpar formulário
document.getElementById('invoice-id').value = '';
document.getElementById('invoice-client-id').value = currentClient.id;
document.getElementById('invoice-reference').value = '';
document.getElementById('invoice-amount').value = '';
document.getElementById('invoice-due-date').value = '';
document.getElementById('invoice-file').value = '';
document.getElementById('invoice-paid').checked = false;

// Atualizar título
document.getElementById('invoiceModalTitle').textContent = invoiceId ? 'Editar Boleto' : 'Adicionar Boleto';

// Se for edição, carregar dados
if (invoiceId) {
// Mostrar loader
const saveBtn = document.getElementById('save-invoice-btn');
saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Carregando...';
saveBtn.disabled = true;

// Carregar dados do boleto
apiRequest(`/clients/${currentClient.id}/invoices/${invoiceId}`)
  .then(data => {
    if (!data.invoice) {
      throw new Error('Boleto não encontrado');
    }
    
    // Preencher formulário
    document.getElementById('invoice-id').value = data.invoice.id;
    document.getElementById('invoice-reference').value = data.invoice.reference || '';
    document.getElementById('invoice-amount').value = data.invoice.amount;
    
    // Formatar data para o input date
    const dueDate = new Date(data.invoice.due_date);
    const formattedDate = dueDate.toISOString().split('T')[0];
    document.getElementById('invoice-due-date').value = formattedDate;
    
    document.getElementById('invoice-paid').checked = data.invoice.paid;
    
    // Restaurar botão
    saveBtn.innerHTML = 'Salvar';
    saveBtn.disabled = false;
  })
  .catch(error => {
    console.error('Erro ao carregar boleto:', error);
    invoiceModal.hide();
    showAlert('Erro', 'Não foi possível carregar os dados do boleto.');
  });
}

// Mostrar modal
invoiceModal.show();
}

/**
* Salva um boleto
*/
function saveInvoice() {
const invoiceId = document.getElementById('invoice-id').value;
const clientId = document.getElementById('invoice-client-id').value;
const formData = new FormData();

formData.append('reference', document.getElementById('invoice-reference').value);
formData.append('amount', document.getElementById('invoice-amount').value);
formData.append('due_date', document.getElementById('invoice-due-date').value);
formData.append('paid', document.getElementById('invoice-paid').checked);

// Adicionar arquivo se selecionado
const fileInput = document.getElementById('invoice-file');
if (fileInput.files.length > 0) {
formData.append('file', fileInput.files[0]);
}

// Definir endpoint e método
const endpoint = invoiceId 
? `/clients/${clientId}/invoices/${invoiceId}` 
: `/clients/${clientId}/invoices`;
const method = invoiceId ? 'PUT' : 'POST';

// Mostrar loader
const saveBtn = document.getElementById('save-invoice-btn');
saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Salvando...';
saveBtn.disabled = true;

// Enviar requisição como FormData
const token = localStorage.getItem('auth_token');
fetch(`${BASE_API_URL}${endpoint}`, {
method: method,
headers: {
  'Authorization': `Bearer ${token}`
},
body: formData
})
.then(response => {
if (!response.ok) {
  throw new Error('Erro ao salvar boleto');
}
return response.json();
})
.then(data => {
// Fechar modal
invoiceModal.hide();

// Mostrar mensagem de sucesso
showAlert('Sucesso', invoiceId ? 'Boleto atualizado com sucesso!' : 'Boleto adicionado com sucesso!');

// Recarregar boletos
loadClientInvoices(clientId);

// Atualizar contador no resumo
const countEl = document.getElementById('client-invoices-count');
countEl.textContent = (parseInt(countEl.textContent) || 0) + (invoiceId ? 0 : 1);
})
.catch(error => {
console.error('Erro ao salvar boleto:', error);

// Restaurar botão
saveBtn.innerHTML = 'Salvar';
saveBtn.disabled = false;

showAlert('Erro', 'Não foi possível salvar o boleto. Verifique os dados e tente novamente.');
});
}

/**
* Visualiza um boleto
* @param {number} invoiceId - ID do boleto
*/
function viewInvoice(invoiceId) {
if (!currentClient) {
return;
}

// Abrir o PDF em nova aba
window.open(`${BASE_API_URL}/clients/${currentClient.id}/invoices/${invoiceId}/pdf`, '_blank');
}

/**
* Edita um boleto
* @param {number} invoiceId - ID do boleto
*/
function editInvoice(invoiceId) {
showInvoiceForm(invoiceId);
}

/**
* Exclui um boleto
* @param {number} invoiceId - ID do boleto
*/
function deleteInvoice(invoiceId) {
if (!currentClient) {
return;
}

// Confirmar exclusão
showAlert(
'Confirmar Exclusão', 
'Tem certeza que deseja excluir este boleto? Esta ação não pode ser desfeita.',
function() {
  // Fazer requisição para excluir
  apiRequest(`/clients/${currentClient.id}/invoices/${invoiceId}`, 'DELETE')
    .then(data => {
      showAlert('Sucesso', 'Boleto excluído com sucesso!');
      
      // Recarregar boletos
      loadClientInvoices(currentClient.id);
      
      // Atualizar contador no resumo
      const countEl = document.getElementById('client-invoices-count');
      countEl.textContent = Math.max(0, (parseInt(countEl.textContent) || 0) - 1);
    })
    .catch(error => {
      console.error('Erro ao excluir boleto:', error);
      showAlert('Erro', 'Não foi possível excluir o boleto. Tente novamente mais tarde.');
    });
}
);
}

/**
* Agenda uma visita para o cliente
*/
function scheduleClientVisit() {
if (!currentClient) {
showAlert('Erro', 'Cliente não selecionado.');
return;
}

// Redirecionar para a página de agendamento com o cliente pré-selecionado
loadPage('schedule');

// Pode ser necessário um pequeno delay para garantir que a página seja carregada
setTimeout(() => {
// Esta função deve estar definida no arquivo schedule.js
if (typeof selectClientForScheduling === 'function') {
  selectClientForScheduling(currentClient.id);
}
}, 500);

// Fechar modal de cliente
clientModal.hide();
}

/**
* Visualiza detalhes de um agendamento
* @param {number} scheduleId - ID do agendamento
*/
function viewSchedule(scheduleId) {
// Redirecionar para a página de agendamento com o agendamento pré-selecionado
loadPage('schedule');

// Pode ser necessário um pequeno delay para garantir que a página seja carregada
setTimeout(() => {
// Esta função deve estar definida no arquivo schedule.js
if (typeof viewScheduleDetails === 'function') {
  viewScheduleDetails(scheduleId);
}
}, 500);

// Fechar modal de cliente
clientModal.hide();
}

/**
* Marca um agendamento como concluído
* @param {number} scheduleId - ID do agendamento
*/
function completeSchedule(scheduleId) {
if (!currentClient) {
return;
}

// Confirmar conclusão
showAlert(
'Confirmar Conclusão', 
'Deseja marcar este agendamento como concluído?',
function() {
  apiRequest(`/clients/${currentClient.id}/schedules/${scheduleId}/complete`, 'POST')
    .then(data => {
      showAlert('Sucesso', 'Agendamento concluído com sucesso!');
      loadClientSchedules(currentClient.id);
      
      // Perguntar se deseja iniciar pesquisa pós-venda
      showAlert(
        'Pesquisa Pós-Venda', 
        'Deseja iniciar uma pesquisa de satisfação para este serviço?',
        function() {
          showPostsaleForm(data.schedule?.service_type);
        }
      );
    })
    .catch(error => {
      console.error('Erro ao concluir agendamento:', error);
      showAlert('Erro', 'Não foi possível concluir o agendamento. Tente novamente mais tarde.');
    });
}
);
}

/**
* Cancela um agendamento
* @param {number} scheduleId - ID do agendamento
*/
function cancelSchedule(scheduleId) {
if (!currentClient) {
return;
}

// Confirmar cancelamento
showAlert(
'Confirmar Cancelamento', 
'Tem certeza que deseja cancelar este agendamento?',
function() {
  apiRequest(`/clients/${currentClient.id}/schedules/${scheduleId}/cancel`, 'POST')
    .then(data => {
      showAlert('Sucesso', 'Agendamento cancelado com sucesso!');
      loadClientSchedules(currentClient.id);
    })
    .catch(error => {
      console.error('Erro ao cancelar agendamento:', error);
      showAlert('Erro', 'Não foi possível cancelar o agendamento. Tente novamente mais tarde.');
    });
}
);
}

/**
* Exibe formulário para iniciar pesquisa pós-venda
* @param {string} serviceType - Tipo de serviço (opcional)
*/
function showPostsaleForm(serviceType = null) {
if (!currentClient) {
showAlert('Erro', 'Cliente não selecionado.');
return;
}

// Limpar formulário
document.getElementById('postsale-client-id').value = currentClient.id;
document.getElementById('postsale-service-type').value = serviceType || '';
document.getElementById('postsale-other-service').value = '';

// Atualizar container de "outro serviço"
const otherContainer = document.getElementById('other-service-container');
if (serviceType === 'Outro') {
otherContainer.classList.remove('d-none');
document.getElementById('postsale-other-service').setAttribute('required', 'required');
} else {
otherContainer.classList.add('d-none');
document.getElementById('postsale-other-service').removeAttribute('required');
}

// Mostrar modal
postsaleModal.show();
}

/**
* Inicia pesquisa de pós-venda
*/
function startPostsaleSurvey() {
const clientId = document.getElementById('postsale-client-id').value;
const serviceType = document.getElementById('postsale-service-type').value;
const otherService = document.getElementById('postsale-other-service').value;

// Validar tipo de serviço
if (!serviceType) {
showAlert('Erro', 'Por favor, selecione o tipo de serviço.');
return;
}

// Validar "outro serviço" se for o caso
if (serviceType === 'Outro' && !otherService) {
showAlert('Erro', 'Por favor, especifique o tipo de serviço.');
return;
}

// Preparar dados
const data = {
service_type: serviceType === 'Outro' ? otherService : serviceType
};

// Mostrar loader
const startBtn = document.getElementById('start-postsale-confirm-btn');
startBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Iniciando...';
startBtn.disabled = true;

// Fazer requisição à API
apiRequest(`/clients/${clientId}/postsale`, 'POST', data)
.then(response => {
  // Fechar modal
  postsaleModal.hide();
  
  // Mostrar mensagem de sucesso
  showAlert('Sucesso', 'Pesquisa de satisfação iniciada com sucesso!');
})
.catch(error => {
  console.error('Erro ao iniciar pesquisa pós-venda:', error);
  
  // Restaurar botão
  startBtn.innerHTML = 'Iniciar Pesquisa';
  startBtn.disabled = false;
  
  showAlert('Erro', 'Não foi possível iniciar a pesquisa de satisfação. Tente novamente mais tarde.');
});
}

/**
* Função de formatação de data
* @param {string} dateString - String de data ISO
* @param {boolean} includeTime - Se deve incluir hora
* @returns {string} Data formatada
*/
function formatDate(dateString, includeTime = false) {
if (!dateString) {
return '-';
}

const date = new Date(dateString);

// Verificar se a data é válida
if (isNaN(date.getTime())) {
return '-';
}

// Formatar data
const day = date.getDate().toString().padStart(2, '0');
const month = (date.getMonth() + 1).toString().padStart(2, '0');
const year = date.getFullYear();

let result = `${day}/${month}/${year}`;

// Adicionar hora se solicitado
if (includeTime) {
const hours = date.getHours().toString().padStart(2, '0');
const minutes = date.getMinutes().toString().padStart(2, '0');
result += ` ${hours}:${minutes}`;
}

return result;
}

/**
* Exibe um alerta personalizado
* @param {string} title - Título do alerta
* @param {string} message - Mensagem do alerta
* @param {Function} confirmCallback - Função de callback para confirmação (opcional)
*/
function showAlert(title, message, confirmCallback) {
// Verificar se o elemento de alerta existe
let alertElement = document.getElementById('custom-alert');

// Criar se não existir
if (!alertElement) {
alertElement = document.createElement('div');
alertElement.id = 'custom-alert';
alertElement.className = 'custom-alert';

const alertContent = document.createElement('div');
alertContent.className = 'custom-alert-content';

alertContent.innerHTML = `
  <div class="custom-alert-header">
    <h5 id="custom-alert-title"></h5>
    <button type="button" class="btn-close" id="custom-alert-close"></button>
  </div>
  <div class="custom-alert-body">
    <p id="custom-alert-message"></p>
  </div>
  <div class="custom-alert-footer">
    <button type="button" class="btn btn-secondary" id="custom-alert-cancel">Cancelar</button>
    <button type="button" class="btn btn-primary" id="custom-alert-confirm">Confirmar</button>
  </div>
`;

alertElement.appendChild(alertContent);
document.body.appendChild(alertElement);

// Adicionar evento de fechamento
document.getElementById('custom-alert-close').addEventListener('click', function() {
  alertElement.classList.remove('show');
});

// Adicionar evento de clique fora para fechar
alertElement.addEventListener('click', function(e) {
  if (e.target === alertElement) {
    alertElement.classList.remove('show');
  }
});
}

// Atualizar conteúdo
document.getElementById('custom-alert-title').textContent = title;
document.getElementById('custom-alert-message').textContent = message;

// Configurar botões
const confirmBtn = document.getElementById('custom-alert-confirm');
const cancelBtn = document.getElementById('custom-alert-cancel');

// Configurar como confirmação ou alerta simples
if (confirmCallback) {
// Modo de confirmação
confirmBtn.style.display = 'block';
cancelBtn.style.display = 'block';

// Adicionar eventos
confirmBtn.onclick = function() {
  alertElement.classList.remove('show');
  confirmCallback();
};

cancelBtn.onclick = function() {
  alertElement.classList.remove('show');
};
} else {
// Modo de alerta simples
confirmBtn.style.display = 'none';
cancelBtn.textContent = 'Fechar';
cancelBtn.style.display = 'block';

// Adicionar evento
cancelBtn.onclick = function() {
  alertElement.classList.remove('show');
};
}

// Mostrar alerta
alertElement.classList.add('show');

// Auto-fechar se for apenas um alerta (não confirmação)
if (!confirmCallback) {
setTimeout(() => {
  alertElement.classList.remove('show');
}, 3000);
}
}

/**
* Faz uma requisição para a API
* @param {string} endpoint - Endpoint da API
* @param {string} method - Método HTTP (GET, POST, PUT, DELETE)
* @param {Object} data - Dados a serem enviados (opcional)
* @returns {Promise} Promise com o resultado da requisição
*/
function apiRequest(endpoint, method = 'GET', data = null) {
const url = `${BASE_API_URL}${endpoint}`;
const token = localStorage.getItem('auth_token');

const options = {
method: method,
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
};

// Adicionar corpo da requisição se houver dados
if (data && (method === 'POST' || method === 'PUT')) {
options.body = JSON.stringify(data);
}

return fetch(url, options)
.then(response => {
  if (!response.ok) {
    // Se for erro de autenticação, redirecionar para login
    if (response.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      window.location.href = 'index.html';
      throw new Error('Sessão expirada ou inválida');
    }
    
    throw new Error('Erro na requisição: ' + response.status);
  }
  
  return response.json();
});
}

/**
* Carrega uma página do painel
* @param {string} page - Nome da página
*/
function loadPage(page) {
window.location.href = `${page}.html`;
}