/**
 * main.js - Arquivo JavaScript principal para WhatsApp Bot Admin
 */

// Variáveis globais
const BASE_API_URL = '/api'; // URL base da API do backend
let currentPage = 'dashboard'; // Página atual exibida
let currentTheme = 'light'; // Tema atual
let userData = null; // Dados do usuário logado

// Aguardar o carregamento completo do DOM
document.addEventListener('DOMContentLoaded', function() {
  // Verificar se o usuário está logado
  checkAuthStatus();
  
  // Configurar manipuladores de eventos
  setupEventHandlers();
  
  // Verificar tema preferido
  loadThemePreference();
});

/**
 * Verifica se o usuário está autenticado
 */
function checkAuthStatus() {
  const token = localStorage.getItem('auth_token');
  
  if (!token) {
    showLoginScreen();
    return;
  }
  
  // Verificar validade do token
  fetch(`${BASE_API_URL}/auth/verify`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Falha na autenticação');
    }
    return response.json();
  })
  .then(data => {
    userData = data.user;
    showMainApp();
    updateUserInfo();
    loadPage(currentPage);
  })
  .catch(error => {
    console.error('Erro ao verificar autenticação:', error);
    localStorage.removeItem('auth_token');
    showLoginScreen();
  });
}

/**
 * Configura manipuladores de eventos para elementos da UI
 */
function setupEventHandlers() {
  // Eventos de navegação do menu lateral
  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const page = this.getAttribute('data-page');
      loadPage(page);
    });
  });
  
  // Eventos de toggle do menu lateral
  document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);
  
  // Eventos de logout
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('dropdown-logout').addEventListener('click', logout);
  
  // Eventos de troca de tema
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  
  // Manipulador de eventos para login
  document.getElementById('login-form').addEventListener('submit', handleLogin);
}

/**
 * Alterna entre tema claro e escuro
 */
function toggleTheme() {
  const themeLink = document.getElementById('theme-css');
  const themeToggle = document.getElementById('theme-toggle');
  const currentThemeText = themeToggle.textContent.trim();
  
  if (currentTheme === 'light') {
    themeLink.href = 'css/dark-theme.css';
    themeToggle.innerHTML = '<i class="fas fa-moon"></i> Tema Escuro';
    currentTheme = 'dark';
  } else {
    themeLink.href = 'css/light-theme.css';
    themeToggle.innerHTML = '<i class="fas fa-sun"></i> Tema Claro';
    currentTheme = 'light';
  }
  
  // Salvar preferência
  localStorage.setItem('theme_preference', currentTheme);
}

/**
 * Carrega preferência de tema salva
 */
function loadThemePreference() {
  const savedTheme = localStorage.getItem('theme_preference');
  if (savedTheme && savedTheme !== currentTheme) {
    toggleTheme();
  }
}

/**
 * Alterna a visibilidade do menu lateral
 */
function toggleSidebar() {
  const body = document.body;
  
  if (window.innerWidth <= 768) {
    body.classList.toggle('sidebar-open');
  } else {
    body.classList.toggle('sidebar-collapsed');
  }
}

/**
 * Carrega a página solicitada
 * @param {string} page - Nome da página a ser carregada
 */
function loadPage(page) {
  // Atualizar a página atual
  currentPage = page;
  
  // Atualizar classe ativa na navegação
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  document.querySelector(`.nav-link[data-page="${page}"]`).classList.add('active');
  
  // Esconder todas as páginas
  document.querySelectorAll('.page-content').forEach(pageEl => {
    pageEl.classList.remove('active-page');
  });
  
  // Verificar se a página já existe no DOM
  let pageEl = document.getElementById(`${page}-page`);
  
  if (pageEl) {
    // Mostrar a página
    pageEl.classList.add('active-page');
  } else {
    // Carregar o conteúdo da página via AJAX
    fetch(`pages/${page}.html`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Página não encontrada');
        }
        return response.text();
      })
      .then(html => {
        // Criar elemento para a nova página
        pageEl = document.createElement('div');
        pageEl.id = `${page}-page`;
        pageEl.className = 'page-content active-page';
        pageEl.innerHTML = html;
        
        // Adicionar ao container
        document.querySelector('.page-container').appendChild(pageEl);
        
        // Carregar script da página se existir
        loadPageScript(page);
      })
      .catch(error => {
        console.error(`Erro ao carregar página ${page}:`, error);
        showPageError(page);
      });
  }
  
  // Fechar sidebar em dispositivos móveis
  if (window.innerWidth <= 768 && document.body.classList.contains('sidebar-open')) {
    document.body.classList.remove('sidebar-open');
  }
}

/**
 * Carrega o script JavaScript específico da página
 * @param {string} page - Nome da página
 */
function loadPageScript(page) {
  const script = document.createElement('script');
  script.src = `js/${page}.js`;
  script.onerror = () => console.warn(`Script para página ${page} não encontrado.`);
  document.body.appendChild(script);
}

/**
 * Exibe mensagem de erro ao carregar uma página
 * @param {string} page - Nome da página que falhou ao carregar
 */
function showPageError(page) {
  const errorDiv = document.createElement('div');
  errorDiv.id = `${page}-page`;
  errorDiv.className = 'page-content active-page';
  errorDiv.innerHTML = `
    <div class="text-center my-5">
      <div class="error mx-auto" data-text="404">404</div>
      <p class="lead text-gray-800 mb-5">Página Não Encontrada</p>
      <p class="text-gray-500 mb-0">Parece que a página solicitada não existe...</p>
      <a href="#" onclick="loadPage('dashboard')">&larr; Voltar ao Dashboard</a>
    </div>
  `;
  
  document.querySelector('.page-container').appendChild(errorDiv);
}

/**
 * Exibe a tela de login e esconde a aplicação principal
 */
function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('d-none');
  document.getElementById('app').classList.add('d-none');
}

/**
 * Exibe a aplicação principal e esconde a tela de login
 */
function showMainApp() {
  document.getElementById('login-screen').classList.add('d-none');
  document.getElementById('app').classList.remove('d-none');
}

/**
 * Atualiza informações do usuário na interface
 */
function updateUserInfo() {
  if (!userData) return;
  
  // Atualiza nome do usuário
  const userNameEl = document.querySelector('.user-name');
  if (userNameEl) {
    userNameEl.textContent = userData.name || 'Usuário';
  }
}

/**
 * Processa o login do usuário
 * @param {Event} event - Evento de submit do formulário
 */
function handleLogin(event) {
  event.preventDefault();
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const alertEl = document.getElementById('login-alert');
  
  // Verificar campos
  if (!email || !password) {
    alertEl.textContent = 'Por favor, preencha todos os campos.';
    alertEl.classList.remove('d-none');
    return;
  }
  
  // Esconder alerta anterior
  alertEl.classList.add('d-none');
  
  // Enviar requisição de login
  fetch(`${BASE_API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Falha no login');
    }
    return response.json();
  })
  .then(data => {
    // Salvar token e dados do usuário
    localStorage.setItem('auth_token', data.token);
    userData = data.user;
    
    // Mostrar aplicação principal
    showMainApp();
    updateUserInfo();
    loadPage('dashboard');
  })
  .catch(error => {
    console.error('Erro no login:', error);
    alertEl.textContent = 'Email ou senha incorretos. Tente novamente.';
    alertEl.classList.remove('d-none');
  });
}

/**
 * Realiza o logout do usuário
 */
function logout() {
  // Limpar dados de autenticação
  localStorage.removeItem('auth_token');
  userData = null;
  
  // Redirecionar para login
  showLoginScreen();
}

/**
 * Exibe uma modal de alerta ou confirmação
 * @param {string} title - Título da modal
 * @param {string} message - Mensagem a ser exibida
 * @param {Function} onConfirm - Função de callback para confirmação (opcional)
 */
function showAlert(title, message, onConfirm = null) {
  const modal = new bootstrap.Modal(document.getElementById('alertModal'));
  document.getElementById('alertModalTitle').textContent = title;
  document.getElementById('alertModalBody').textContent = message;
  
  const confirmBtn = document.getElementById('alertModalConfirm');
  
  if (onConfirm) {
    confirmBtn.classList.remove('d-none');
    confirmBtn.onclick = () => {
      onConfirm();
      modal.hide();
    };
  } else {
    confirmBtn.classList.add('d-none');
  }
  
  modal.show();
}

/**
 * Formata uma data para exibição
 * @param {string} dateString - String de data para formatar
 * @param {boolean} includeTime - Se deve incluir a hora
 * @returns {string} Data formatada
 */
function formatDate(dateString, includeTime = false) {
  const date = new Date(dateString);
  
  const options = { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric'
  };
  
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  
  return date.toLocaleDateString('pt-BR', options);
}

/**
 * Função utilitária para fazer requisições à API
 * @param {string} endpoint - Endpoint da API
 * @param {string} method - Método HTTP (GET, POST, PUT, DELETE)
 * @param {object} data - Dados para enviar (para POST, PUT)
 * @returns {Promise} Promise com a resposta
 */
function apiRequest(endpoint, method = 'GET', data = null) {
  const token = localStorage.getItem('auth_token');
  
  const options = {
    method: method,
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };
  
  if (data && (method === 'POST' || method === 'PUT')) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(data);
  }
  
  return fetch(`${BASE_API_URL}${endpoint}`, options)
    .then(response => {
      if (!response.ok) {
        if (response.status === 401) {
          // Token expirado ou inválido
          localStorage.removeItem('auth_token');
          showLoginScreen();
          throw new Error('Sessão expirada. Por favor, faça login novamente.');
        }
        throw new Error('Erro na requisição');
      }
      return response.json();
    });
}