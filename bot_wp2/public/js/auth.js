/**
 * auth.js - Gerenciamento de autenticação no painel administrativo
 * 
 * Este arquivo contém as funções necessárias para autenticação,
 * verificação de sessão, e gerenciamento de tokens de acesso.
 */

// Variáveis globais
const BASE_API_URL = '/api';
let currentUser = null;

// Verificar se o usuário está logado quando a página carregar
document.addEventListener('DOMContentLoaded', function() {
  checkAuthStatus();
  setupAuthEventListeners();
});

/**
 * Configura os event listeners relacionados à autenticação
 */
function setupAuthEventListeners() {
  // Formulário de login
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      login();
    });
  }
  
  // Botão de logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      logout();
    });
  }
  
  // Botão para mostrar modal de alterar senha
  const changePasswordBtn = document.getElementById('change-password-btn');
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', function() {
      showChangePasswordModal();
    });
  }
  
  // Formulário de alterar senha
  const changePasswordForm = document.getElementById('change-password-form');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', function(e) {
      e.preventDefault();
      changePassword();
    });
  }
}

/**
 * Verifica o status de autenticação do usuário
 */
function checkAuthStatus() {
  const token = localStorage.getItem('auth_token');
  
  // Redirecionar para login se não estiver na página de login e não tiver token
  if (!token && !window.location.pathname.includes('index.html')) {
    window.location.href = 'index.html';
    return;
  }
  
  // Se estiver na página de login e tiver token, redirecionar para dashboard
  if (token && window.location.pathname.includes('index.html')) {
    window.location.href = 'dashboard.html';
    return;
  }
  
  // Se tiver token, verificar validade
  if (token) {
    verifyToken(token);
  }
}

/**
 * Verifica a validade do token de autenticação
 * @param {string} token - Token de autenticação
 */
function verifyToken(token) {
  fetch(`${BASE_API_URL}/auth/verify`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Token inválido');
    }
    return response.json();
  })
  .then(data => {
    // Token válido, salvar dados do usuário
    currentUser = data.user;
    localStorage.setItem('user_data', JSON.stringify(currentUser));
    
    // Atualizar elementos da interface (se existirem)
    updateUserInterface();
  })
  .catch(error => {
    console.error('Erro ao verificar token:', error);
    
    // Limpar dados de autenticação
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    
    // Redirecionar para login se não estiver na página de login
    if (!window.location.pathname.includes('index.html')) {
      window.location.href = 'index.html';
    }
  });
}

/**
 * Realiza o login do usuário
 */
function login() {
  // Obter dados do formulário
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  // Validar campos
  if (!username || !password) {
    showAlert('Erro', 'Por favor, preencha todos os campos');
    return;
  }
  
  // Exibir loader
  const loginBtn = document.getElementById('login-btn');
  loginBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Entrando...';
  loginBtn.disabled = true;
  
  // Fazer requisição de login
  fetch(`${BASE_API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Credenciais inválidas');
    }
    return response.json();
  })
  .then(data => {
    // Salvar token e dados do usuário
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('user_data', JSON.stringify(data.user));
    currentUser = data.user;
    
    // Redirecionar para o dashboard
    window.location.href = 'dashboard.html';
  })
  .catch(error => {
    console.error('Erro ao fazer login:', error);
    
    // Restaurar botão
    loginBtn.innerHTML = 'Entrar';
    loginBtn.disabled = false;
    
    // Mostrar mensagem de erro
    showAlert('Erro', 'Usuário ou senha incorretos. Tente novamente.');
  });
}

/**
 * Realiza o logout do usuário
 */
function logout() {
  // Limpar dados de autenticação
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_data');
  currentUser = null;
  
  // Redirecionar para a página de login
  window.location.href = 'index.html';
}

/**
 * Exibe o modal para alterar senha
 */
function showChangePasswordModal() {
  // Limpar formulário
  document.getElementById('current-password').value = '';
  document.getElementById('new-password').value = '';
  document.getElementById('confirm-password').value = '';
  
  // Exibir modal (usando Bootstrap)
  const changePasswordModal = new bootstrap.Modal(document.getElementById('change-password-modal'));
  changePasswordModal.show();
}

/**
 * Altera a senha do usuário
 */
function changePassword() {
  // Obter dados do formulário
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  
  // Validar campos
  if (!currentPassword || !newPassword || !confirmPassword) {
    showAlert('Erro', 'Por favor, preencha todos os campos');
    return;
  }
  
  // Verificar se as senhas coincidem
  if (newPassword !== confirmPassword) {
    showAlert('Erro', 'As novas senhas não coincidem');
    return;
  }
  
  // Exibir loader
  const saveBtn = document.getElementById('save-password-btn');
  saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Salvando...';
  saveBtn.disabled = true;
  
  // Obter token
  const token = localStorage.getItem('auth_token');
  
  // Fazer requisição para alterar senha
  fetch(`${BASE_API_URL}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      currentPassword,
      newPassword
    })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Não foi possível alterar a senha');
    }
    return response.json();
  })
  .then(data => {
    // Esconder modal
    const changePasswordModal = bootstrap.Modal.getInstance(document.getElementById('change-password-modal'));
    changePasswordModal.hide();
    
    // Mostrar mensagem de sucesso
    showAlert('Sucesso', 'Senha alterada com sucesso');
  })
  .catch(error => {
    console.error('Erro ao alterar senha:', error);
    
    // Restaurar botão
    saveBtn.innerHTML = 'Salvar';
    saveBtn.disabled = false;
    
    // Mostrar mensagem de erro
    showAlert('Erro', 'Não foi possível alterar a senha. Verifique se a senha atual está correta.');
  });
}

/**
 * Atualiza elementos da interface com dados do usuário
 */
function updateUserInterface() {
  // Verificar se temos dados do usuário
  if (!currentUser) {
    const storedUser = localStorage.getItem('user_data');
    if (storedUser) {
      try {
        currentUser = JSON.parse(storedUser);
      } catch (error) {
        console.error('Erro ao processar dados do usuário:', error);
        return;
      }
    } else {
      // Sem dados do usuário
      return;
    }
  }
  
  // Atualizar nome do usuário no menu
  const userNameElement = document.getElementById('user-name');
  if (userNameElement) {
    userNameElement.textContent = currentUser.name || currentUser.username;
  }
  
  // Atualizar avatar do usuário
  const userAvatarElement = document.getElementById('user-avatar');
  if (userAvatarElement) {
    userAvatarElement.src = currentUser.avatar || 'img/user-avatar.png';
    userAvatarElement.alt = currentUser.name || currentUser.username;
  }
  
  // Verificar permissões e ajustar a interface
  updateUIBasedOnPermissions();
}

/**
 * Atualiza a interface com base nas permissões do usuário
 */
function updateUIBasedOnPermissions() {
  if (!currentUser || !currentUser.role) {
    return;
  }
  
  // Elementos que dependem de permissões específicas
  const adminElements = document.querySelectorAll('.admin-only');
  const managerElements = document.querySelectorAll('.manager-only');
  const agentElements = document.querySelectorAll('.agent-only');
  
  // Aplicar visibilidade com base no papel do usuário
  switch (currentUser.role) {
    case 'admin':
      // Administrador tem acesso a tudo
      adminElements.forEach(el => el.classList.remove('d-none'));
      managerElements.forEach(el => el.classList.remove('d-none'));
      agentElements.forEach(el => el.classList.remove('d-none'));
      break;
      
    case 'manager':
      // Gerente tem acesso a funcionalidades de gerente e agente
      adminElements.forEach(el => el.classList.add('d-none'));
      managerElements.forEach(el => el.classList.remove('d-none'));
      agentElements.forEach(el => el.classList.remove('d-none'));
      break;
      
    case 'agent':
      // Agente tem acesso apenas a funcionalidades de agente
      adminElements.forEach(el => el.classList.add('d-none'));
      managerElements.forEach(el => el.classList.add('d-none'));
      agentElements.forEach(el => el.classList.remove('d-none'));
      break;
      
    default:
      // Papel desconhecido, esconder tudo
      adminElements.forEach(el => el.classList.add('d-none'));
      managerElements.forEach(el => el.classList.add('d-none'));
      agentElements.forEach(el => el.classList.add('d-none'));
  }
}

/**
 * Exibe um alerta para o usuário
 * @param {string} title - Título do alerta
 * @param {string} message - Mensagem do alerta
 */
function showAlert(title, message) {
  // Verificar se temos o elemento de alerta
  const alertContainer = document.getElementById('alert-container');
  if (!alertContainer) {
    // Criar container de alerta se não existir
    const container = document.createElement('div');
    container.id = 'alert-container';
    container.className = 'position-fixed top-0 end-0 p-3';
    container.style.zIndex = '5000';
    document.body.appendChild(container);
  }
  
  // Criar elemento de alerta
  const alertId = `alert-${new Date().getTime()}`;
  const alertElement = document.createElement('div');
  alertElement.id = alertId;
  alertElement.className = 'toast';
  alertElement.role = 'alert';
  alertElement.setAttribute('aria-live', 'assertive');
  alertElement.setAttribute('aria-atomic', 'true');
  
  // Definir conteúdo
  alertElement.innerHTML = `
    <div class="toast-header">
      <strong class="me-auto">${title}</strong>
      <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Fechar"></button>
    </div>
    <div class="toast-body">
      ${message}
    </div>
  `;
  
  // Adicionar ao container
  const container = document.getElementById('alert-container');
  container.appendChild(alertElement);
  
  // Inicializar toast (Bootstrap)
  const toast = new bootstrap.Toast(alertElement, {
    autohide: true,
    delay: 3000
  });
  
  // Exibir toast
  toast.show();
  
  // Remover do DOM após esconder
  alertElement.addEventListener('hidden.bs.toast', function() {
    this.remove();
  });
}

/**
 * Verifica se o usuário tem determinada permissão
 * @param {string} permission - Permissão a ser verificada
 * @returns {boolean} Verdadeiro se o usuário tem a permissão
 */
function hasPermission(permission) {
  if (!currentUser || !currentUser.role) {
    return false;
  }
  
  // Definir hierarquia de permissões para cada função
  const permissionsByRole = {
    admin: [
      'manage_users',
      'manage_connections',
      'manage_menus',
      'view_statistics',
      'manage_settings',
      'manage_clients',
      'chat_with_clients',
      'manage_schedules',
      'view_ratings',
      'send_invoices'
    ],
    manager: [
      'view_statistics',
      'manage_clients',
      'chat_with_clients',
      'manage_schedules',
      'view_ratings',
      'send_invoices'
    ],
    agent: [
      'chat_with_clients',
      'view_clients',
      'view_schedules'
    ]
  };
  
  // Verificar se o papel do usuário tem a permissão
  return permissionsByRole[currentUser.role]?.includes(permission) || false;
}

// Exportar funções e variáveis que podem ser usadas por outros scripts
window.auth = {
  currentUser,
  hasPermission,
  logout,
  showChangePasswordModal
};