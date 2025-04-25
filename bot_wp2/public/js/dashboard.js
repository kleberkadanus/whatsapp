/**
 * dashboard.js - Funcionalidades para a página do Dashboard
 */

// Variáveis para os gráficos
let messagesChart = null;
let menuChart = null;

// Inicializar dashboard quando o documento estiver carregado
document.addEventListener('DOMContentLoaded', function() {
  // Inicializar apenas se estiver na página de dashboard
  if (document.getElementById('dashboard-page')) {
    initDashboard();
  }
});

/**
 * Inicializa o dashboard
 */
function initDashboard() {
  // Carregar estatísticas
  loadDashboardStats();
  
  // Inicializar gráficos
  initMessagesChart();
  initMenuChart();
  
  // Carregar atividades recentes
  loadRecentActivities();
  
  // Configurar refresh automático a cada 2 minutos
  setInterval(loadDashboardStats, 120000);
  
  // Configurar botão de refresh
  document.getElementById('refresh-stats').addEventListener('click', function() {
    loadDashboardStats();
    loadRecentActivities();
  });
}

/**
 * Carrega estatísticas do dashboard
 */
function loadDashboardStats() {
  showLoader('client-count');
  showLoader('message-count');
  showLoader('active-sessions');
  showLoader('schedule-count');
  
  apiRequest('/dashboard/stats')
    .then(data => {
      // Atualizar contadores
      document.getElementById('client-count').textContent = data.clientCount;
      document.getElementById('message-count').textContent = data.messagesCount;
      document.getElementById('active-sessions').textContent = data.activeSessions;
      document.getElementById('schedule-count').textContent = data.schedulingsCount;
      
      // Atualizar dados dos gráficos
      updateMessagesChart(data.messagesTimeline);
      updateMenuChart(data.menuDistribution);
    })
    .catch(error => {
      console.error('Erro ao carregar estatísticas:', error);
      showAlert('Erro', 'Falha ao carregar estatísticas do dashboard.');
    });
}

/**
 * Carrega lista de atividades recentes
 */
function loadRecentActivities() {
  const tableBody = document.querySelector('#recent-activities-table tbody');
  
  // Exibir loader
  tableBody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="loader"></div></td></tr>';
  
  apiRequest('/dashboard/activities')
    .then(data => {
      // Limpar tabela
      tableBody.innerHTML = '';
      
      if (!data.activities || data.activities.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhuma atividade recente encontrada.</td></tr>';
        return;
      }
      
      // Adicionar atividades
      data.activities.forEach(activity => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${formatDate(activity.created_at, true)}</td>
          <td>${activity.client_name || activity.phone}</td>
          <td>${getActivityTypeLabel(activity.type)}</td>
          <td>${activity.description}</td>
        `;
        tableBody.appendChild(row);
      });
    })
    .catch(error => {
      console.error('Erro ao carregar atividades recentes:', error);
      tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Erro ao carregar atividades.</td></tr>';
    });
}

/**
 * Obter label para tipos de atividade
 * @param {string} type - Tipo de atividade
 * @returns {string} Label formatada em HTML
 */
function getActivityTypeLabel(type) {
  const types = {
    'message': '<span class="badge bg-primary">Mensagem</span>',
    'scheduling': '<span class="badge bg-success">Agendamento</span>',
    'rating': '<span class="badge bg-warning">Avaliação</span>',
    'payment': '<span class="badge bg-info">Pagamento</span>',
    'postsale': '<span class="badge bg-secondary">Pós-venda</span>',
    'support': '<span class="badge bg-danger">Suporte</span>'
  };
  
  return types[type] || `<span class="badge bg-secondary">${type}</span>`;
}

/**
 * Inicializa o gráfico de mensagens
 */
function initMessagesChart() {
  const ctx = document.getElementById('messagesChart');
  
  // Verificar se o elemento existe na página atual
  if (!ctx) return;
  
  messagesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['00h', '02h', '04h', '06h', '08h', '10h', '12h', '14h', '16h', '18h', '20h', '22h'],
      datasets: [{
        label: 'Recebidas',
        borderColor: '#4e73df',
        backgroundColor: 'rgba(78, 115, 223, 0.05)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#4e73df',
        pointBorderColor: '#4e73df',
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#4e73df',
        pointHoverBorderColor: '#4e73df',
        pointHitRadius: 10,
        data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        fill: true
      },
      {
        label: 'Enviadas',
        borderColor: '#1cc88a',
        backgroundColor: 'rgba(28, 200, 138, 0.05)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#1cc88a',
        pointBorderColor: '#1cc88a',
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#1cc88a',
        pointHoverBorderColor: '#1cc88a',
        pointHitRadius: 10,
        data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        fill: true
      }]
    },
    options: {
      maintainAspectRatio: false,
      layout: {
        padding: {
          left: 10,
          right: 25,
          top: 25,
          bottom: 0
        }
      },
      scales: {
        x: {
          grid: {
            display: false,
            drawBorder: false
          }
        },
        y: {
          ticks: {
            maxTicksLimit: 5,
            beginAtZero: true
          },
          grid: {
            color: "rgb(233, 236, 244)",
            zeroLineColor: "rgb(233, 236, 244)",
            drawBorder: false,
            borderDash: [2],
            zeroLineBorderDash: [2]
          }
        }
      },
      plugins: {
        legend: {
          display: true
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      }
    }
  });
}

/**
 * Atualiza os dados do gráfico de mensagens
 * @param {Array} data - Dados de mensagens
 */
function updateMessagesChart(data) {
  if (!messagesChart || !data) return;
  
  messagesChart.data.datasets[0].data = data.incoming || [];
  messagesChart.data.datasets[1].data = data.outgoing || [];
  messagesChart.update();
}

/**
 * Inicializa o gráfico de distribuição de menus
 */
function initMenuChart() {
  const ctx = document.getElementById('menuChart');
  
  // Verificar se o elemento existe na página atual
  if (!ctx) return;
  
  menuChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Principal', 'Suporte', 'Financeiro', 'Comercial', 'Outros'],
      datasets: [{
        data: [0, 0, 0, 0, 0],
        backgroundColor: ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#858796'],
        hoverBackgroundColor: ['#2e59d9', '#17a673', '#2c9faf', '#f4b619', '#6e707e'],
        hoverBorderColor: "rgba(234, 236, 244, 1)",
      }]
    },
    options: {
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          display: true,
          position: 'bottom'
        }
      }
    }
  });
}

/**
 * Atualiza os dados do gráfico de distribuição de menus
 * @param {Array} data - Dados de distribuição de menus
 */
function updateMenuChart(data) {
  if (!menuChart || !data) return;
  
  // Atualizar labels e dados
  menuChart.data.labels = data.map(item => item.menu);
  menuChart.data.datasets[0].data = data.map(item => item.count);
  
  menuChart.update();
}

/**
 * Exibe um loader no lugar de um elemento
 * @param {string} elementId - ID do elemento
 */
function showLoader(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = '<div class="loader"></div>';
  }
}