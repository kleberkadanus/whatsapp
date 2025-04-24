# WhatsApp Bot - Sistema de Administração

Este projeto consiste em um painel administrativo completo para o gerenciamento de um bot de WhatsApp corporativo, oferecendo funcionalidades como gerenciamento de clientes, customização de menus, acompanhamento de mensagens, gerenciamento de boletos, e muito mais.

## Estrutura do Projeto

### Arquivos HTML

1. **index.html** - Página principal com estrutura base da aplicação
   - Inclui layout responsivo com sidebar, cabeçalho e área de conteúdo principal
   - Sistema de autenticação integrado
   - Framework para carregamento dinâmico de páginas

### CSS

1. **style.css** - Estilos principais da aplicação
   - Layout responsivo
   - Estilização de componentes personalizados
   - Suporte para modo mobile com menu retrátil

2. **light-theme.css** - Tema claro 
   - Definição de variáveis de cores e estilos para tema claro

3. **dark-theme.css** - Tema escuro
   - Definição de variáveis de cores e estilos para tema escuro

### JavaScript Core

1. **main.js** - Funções principais do sistema
   - Gerenciamento de autenticação
   - Navegação dinâmica entre páginas
   - Utilitários e funções de apoio comuns

2. **auth.js** - Sistema de autenticação
   - Login/logout
   - Gerenciamento de tokens
   - Verificação de permissões

### Páginas

1. **pages/dashboard.html** - Dashboard principal
   - Visão geral estatística do sistema
   - Gráficos e indicadores de desempenho
   - Atividades recentes

2. **pages/clients.html** - Gerenciamento de clientes
   - Listagem e busca de clientes
   - Visualização de histórico de mensagens
   - Gerenciamento de boletos e agendamentos por cliente
   - Sistema de pós-venda

3. **pages/menus.html** - Editor de menus
   - Interface visual para criação e edição de menus
   - Sistema de arrastar e soltar para reorganização
   - Gerenciamento de opções e ações

4. **pages/connections.html** - Gestão de conexões WhatsApp
   - Suporte para múltiplas conexões de WhatsApp
   - QR Code para pareamento
   - Monitoramento de status de conexão

### JavaScript de Páginas

1. **js/dashboard.js** - Funcionalidades do dashboard
   - Carregamento de estatísticas
   - Inicialização de gráficos
   - Atualização periódica de dados

2. **js/clients.js** - Gerenciamento de clientes
   - Carregamento e exibição de clientes
   - Gerenciamento de histórico de mensagens
   - Funções para boletos e agendamentos
   - Implementação de pesquisa pós-venda

3. **js/menus.js** - Editor de menus
   - Carregamento e salvamento de estrutura de menus
   - Adição e remoção de opções
   - Funcionalidades de arrastar e soltar para reorganização

4. **js/connections.js** - Gestão de conexões
   - Funções para adicionar e gerenciar conexões
   - Geração de QR Code para pareamento
   - Monitoramento de status de conexão

## Bancos de Dados

1. **whatsapp_connections.sql** - Tabelas para conexões WhatsApp
   - Estrutura para suporte a múltiplas conexões
   - Estatísticas por conexão
   - Configurações de menus por conexão

## Funcionalidades Principais

### 1. Dashboard Intuitivo
- Visão geral estatística do sistema
- Gráficos de desempenho e atividade
- Lista de atividades recentes

### 2. Gerenciamento de Clientes
- Visualização completa de clientes cadastrados
- Histórico de conversas
- Adição e gerenciamento de boletos
- Agendamento de visitas técnicas
- Sistema de pós-venda

### 3. Editor Visual de Menus
- Criação e edição intuitiva de menus
- Reorganização por arrastar e soltar
- Personalização de textos e ações
- Visualização em árvore da estrutura completa

### 4. Múltiplas Conexões WhatsApp
- Suporte para várias instâncias de WhatsApp
- Configuração de bot ou atendente para cada conexão
- Monitoramento de status em tempo real
- Estatísticas individuais por conexão

### 5. Sistema de Templates Customizáveis
- Edição de mensagens automatizadas
- Personalização para cada etapa do atendimento
- Suporte a variáveis para personalização

### 6. Agendamentos e Calendário
- Visualização de calendário de visitas
- Gestão de confirmações automáticas
- Histórico de agendamentos por cliente

### 7. Financeiro
- Gestão de boletos por cliente
- Envio automático de segundas vias
- Suporte a chave PIX

### 8. Tema Claro/Escuro
- Suporte a preferências visuais do usuário
- Preservação da escolha entre sessões

## Requisitos do Sistema

- Navegador moderno (Chrome, Firefox, Edge, Safari)
- Servidor web com suporte PHP 7.4+ e MySQL/MariaDB
- Node.js para o backend do bot
- Conexão estável à internet

## Instalação

1. Clone este repositório
2. Configure a conexão com o banco de dados em `config.php`
3. Execute os scripts SQL para criar a estrutura do banco
4. Inicie o servidor do WhatsApp Bot com `node index.js`
5. Acesse o painel administrativo via navegador

## Segurança

- Autenticação baseada em tokens JWT
- Proteção contra CSRF
- Sanitização de entrada em todos os formulários
- Logs detalhados de atividades e acessos