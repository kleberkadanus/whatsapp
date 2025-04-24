-- Criar o banco de dados
CREATE DATABASE IF NOT EXISTS whatsapp_bot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Usar o banco de dados criado
USE whatsapp_bot;

-- Tabela de usuários/clientes
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255),
    email VARCHAR(255),
    address TEXT,
    complement TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (phone)
) ENGINE=InnoDB;

-- Tabela de sessões
CREATE TABLE IF NOT EXISTS sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    menu VARCHAR(50) DEFAULT 'init',
    current_menu VARCHAR(50) DEFAULT 'init',
    with_agent BOOLEAN DEFAULT FALSE,
    agent_phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX (user_id)
) ENGINE=InnoDB;

-- Tabela de escolhas de usuários (para histórico)
CREATE TABLE IF NOT EXISTS user_choices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    menu_path VARCHAR(50),
    option_id INT,
    additional_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX (user_id)
) ENGINE=InnoDB;

-- Tabela de mensagens
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    direction ENUM('incoming', 'outgoing') NOT NULL,
    message_text TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX (user_id),
    INDEX (created_at)
) ENGINE=InnoDB;

-- Tabela de configurações
CREATE TABLE IF NOT EXISTS configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    key_name VARCHAR(100) NOT NULL UNIQUE,
    key_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (key_name)
) ENGINE=InnoDB;

-- Tabela de menus
CREATE TABLE IF NOT EXISTS menus (
    id INT AUTO_INCREMENT PRIMARY KEY,
    menu_key VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    handler VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (menu_key)
) ENGINE=InnoDB;

-- Tabela de opções de menu
CREATE TABLE IF NOT EXISTS menu_options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    menu_id INT NOT NULL,
    option_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    next_menu VARCHAR(50),
    handler VARCHAR(50),
    agent_phone VARCHAR(20),
    config_key VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE,
    INDEX (menu_id, option_id),
    UNIQUE KEY unique_menu_option (menu_id, option_id)
) ENGINE=InnoDB;

-- Tabela de textos personalizados
CREATE TABLE IF NOT EXISTS custom_texts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    text_key VARCHAR(100) NOT NULL UNIQUE,
    text_value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (text_key)
) ENGINE=InnoDB;

-- Tabela de agendamentos
CREATE TABLE IF NOT EXISTS schedulings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    event_id VARCHAR(255),
    service_type VARCHAR(100) NOT NULL,
    service_option VARCHAR(100),
    description TEXT,
    appointment_date DATETIME NOT NULL,
    status ENUM('pending', 'confirmed', 'cancelled', 'completed') DEFAULT 'pending',
    reminder_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX (user_id),
    INDEX (appointment_date),
    INDEX (status)
) ENGINE=InnoDB;

-- Tabela de preços de serviços
CREATE TABLE IF NOT EXISTS service_prices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service_type VARCHAR(100) NOT NULL UNIQUE,
    price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (service_type)
) ENGINE=InnoDB;

-- Tabela de configurações de APIs externas
CREATE TABLE IF NOT EXISTS api_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    api_name VARCHAR(50) NOT NULL UNIQUE,
    client_id VARCHAR(255),
    client_secret VARCHAR(255),
    refresh_token TEXT,
    access_token TEXT,
    expiry_date BIGINT,
    calendar_id VARCHAR(255),
    api_key VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (api_name)
) ENGINE=InnoDB;

-- Tabela de avaliações
CREATE TABLE IF NOT EXISTS ratings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    session_id INT,
    agent_phone VARCHAR(20),
    menu_path VARCHAR(50),
    option_id INT,
    rating_score INT NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX (user_id),
    INDEX (agent_phone)
) ENGINE=InnoDB;

-- Tabela de pesquisas pós-venda
CREATE TABLE IF NOT EXISTS postsale_surveys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    service_type VARCHAR(100),
    rating INT,
    comment TEXT,
    recommendation VARCHAR(100),
    status ENUM('started', 'rated', 'commented', 'completed') DEFAULT 'started',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX (user_id),
    INDEX (status)
) ENGINE=InnoDB;

-- Tabela de solicitações de pós-venda
CREATE TABLE IF NOT EXISTS postsale_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    service_type VARCHAR(100),
    status ENUM('pending', 'processing', 'completed', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX (user_id),
    INDEX (status)
) ENGINE=InnoDB;

-- Tabela de configurações de pós-venda
CREATE TABLE IF NOT EXISTS postsale_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting VARCHAR(100) NOT NULL UNIQUE,
    value VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (setting)
) ENGINE=InnoDB;

-- Tabela de aceitação dos termos LGPD
CREATE TABLE IF NOT EXISTS terms_acceptance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    accepted BOOLEAN DEFAULT FALSE,
    acceptance_date DATETIME,
    terms_version VARCHAR(20) DEFAULT '1.0',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX (user_id)
) ENGINE=InnoDB;

-- Tabela de boletos
CREATE TABLE IF NOT EXISTS invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    reference VARCHAR(100),
    amount DECIMAL(10, 2) NOT NULL,
    due_date DATE NOT NULL,
    paid BOOLEAN DEFAULT FALSE,
    pdf_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX (user_id),
    INDEX (due_date)
) ENGINE=InnoDB;

-- Tabela de números bloqueados
CREATE TABLE IF NOT EXISTS blocked_numbers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(20) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (phone)
) ENGINE=InnoDB;

-- Inserir dados nos menus
INSERT INTO menus (menu_key, title, message) VALUES
('main', 'Menu Principal', 'Em que podemos lhe ajudar hoje?'),
('support', 'Suporte Técnico', 'Selecione o tipo de suporte:'),
('commercial', 'Comercial', 'Selecione uma opção:'),
('financial', 'Financeiro', 'Selecione uma opção:'),
('schedule', 'Agendamento', 'Selecione o tipo de serviço:'),
('info', 'Informações', 'Escolha uma opção:'),
('contacts', 'Contatos', 'Como prefere entrar em contato conosco?'),
('plans', 'Planos', 'Conheça nossos planos:'),
('internet', 'Problemas de Internet', 'Qual problema está enfrentando?'),
('equipment', 'Problemas com Equipamento', 'Selecione uma opção:'),
('payment', 'Pagamentos', 'Selecione uma opção:'),
('installation', 'Instalação', 'Escolha uma opção:'),
('cancellation', 'Cancelamento', 'Por favor, selecione o motivo do cancelamento:'),
('feedback', 'Feedback', 'Escolha uma opção:'),
('help', 'Ajuda', 'Como podemos ajudar?');

-- Inserir opções para o menu principal
INSERT INTO menu_options (menu_id, option_id, title, next_menu, handler) VALUES
((SELECT id FROM menus WHERE menu_key = 'main'), 1, 'Suporte Técnico', 'support', NULL),
((SELECT id FROM menus WHERE menu_key = 'main'), 2, 'Comercial', 'commercial', NULL),
((SELECT id FROM menus WHERE menu_key = 'main'), 3, 'Financeiro', 'financial', NULL),
((SELECT id FROM menus WHERE menu_key = 'main'), 4, 'Agendar visita técnica', NULL, 'startScheduling'),
((SELECT id FROM menus WHERE menu_key = 'main'), 5, 'Informações', 'info', NULL);

-- Inserir opções para o menu de suporte técnico
INSERT INTO menu_options (menu_id, option_id, title, next_menu, handler, config_key) VALUES
((SELECT id FROM menus WHERE menu_key = 'support'), 1, 'Problema com internet', 'internet', NULL, NULL),
((SELECT id FROM menus WHERE menu_key = 'support'), 2, 'Problema com equipamento', 'equipment', NULL, NULL),
((SELECT id FROM menus WHERE menu_key = 'support'), 3, 'Falar com atendente', NULL, 'forward', 'support_agent'),
((SELECT id FROM menus WHERE menu_key = 'support'), 0, 'Voltar', 'main', NULL, NULL);

-- Inserir opções para o menu de problemas de internet
INSERT INTO menu_options (menu_id, option_id, title, next_menu, handler, config_key) VALUES
((SELECT id FROM menus WHERE menu_key = 'internet'), 1, 'Internet lenta', NULL, 'forward', 'support_agent'),
((SELECT id FROM menus WHERE menu_key = 'internet'), 2, 'Sem conexão', NULL, 'forward', 'support_agent'),
((SELECT id FROM menus WHERE menu_key = 'internet'), 3, 'Conexão instável', NULL, 'forward', 'support_agent'),
((SELECT id FROM menus WHERE menu_key = 'internet'), 4, 'Agendar visita técnica', NULL, 'startScheduling', NULL),
((SELECT id FROM menus WHERE menu_key = 'internet'), 0, 'Voltar', 'support', NULL, NULL);

-- Inserir opções para o menu de problemas com equipamento
INSERT INTO menu_options (menu_id, option_id, title, next_menu, handler, config_key) VALUES
((SELECT id FROM menus WHERE menu_key = 'equipment'), 1, 'Roteador não liga', NULL, 'forward', 'support_agent'),
((SELECT id FROM menus WHERE menu_key = 'equipment'), 2, 'Luzes piscando', NULL, 'forward', 'support_agent'),
((SELECT id FROM menus WHERE menu_key = 'equipment'), 3, 'Equipamento danificado', NULL, 'startScheduling', NULL),
((SELECT id FROM menus WHERE menu_key = 'equipment'), 0, 'Voltar', 'support', NULL, NULL);

-- Inserir opções para o menu comercial
INSERT INTO menu_options (menu_id, option_id, title, next_menu, handler, config_key) VALUES
((SELECT id FROM menus WHERE menu_key = 'commercial'), 1, 'Novos planos', 'plans', NULL, NULL),
((SELECT id FROM menus WHERE menu_key = 'commercial'), 2, 'Mudança de endereço', NULL, 'startScheduling', NULL),
((SELECT id FROM menus WHERE menu_key = 'commercial'), 3, 'Upgrade de plano', NULL, 'forward', 'commercial_agent'),
((SELECT id FROM menus WHERE menu_key = 'commercial'), 4, 'Falar com consultor', NULL, 'forward', 'commercial_agent'),
((SELECT id FROM menus WHERE menu_key = 'commercial'), 0, 'Voltar', 'main', NULL, NULL);

-- Inserir opções para o menu de planos
INSERT INTO menu_options (menu_id, option_id, title, next_menu, handler, config_key) VALUES
((SELECT id FROM menus WHERE menu_key = 'plans'), 1, 'Plano Básico', NULL, 'forward', 'commercial_agent'),
((SELECT id FROM menus WHERE menu_key = 'plans'), 2, 'Plano Premium', NULL, 'forward', 'commercial_agent'),
((SELECT id FROM menus WHERE menu_key = 'plans'), 3, 'Plano Empresarial', NULL, 'forward', 'commercial_agent'),
((SELECT id FROM menus WHERE menu_key = 'plans'), 0, 'Voltar', 'commercial', NULL, NULL);

-- Inserir opções para o menu financeiro
INSERT INTO menu_options (menu_id, option_id, title, next_menu, handler) VALUES
((SELECT id FROM menus WHERE menu_key = 'financial'), 1, '2ª via de boleto', NULL, 'listInvoices'),
((SELECT id FROM menus WHERE menu_key = 'financial'), 2, 'Chave PIX', NULL, 'sendPixKey'),
((SELECT id FROM menus WHERE menu_key = 'financial'), 3, 'Pagamentos', 'payment', NULL),
((SELECT id FROM menus WHERE menu_key = 'financial'), 4, 'Falar com financeiro', NULL, 'forward'),
((SELECT id FROM menus WHERE menu_key = 'financial'), 0, 'Voltar', 'main', NULL);

-- Inserir opções para o menu de pagamentos
INSERT INTO menu_options (menu_id, option_id, title, next_menu, handler, config_key) VALUES
((SELECT id FROM menus WHERE menu_key = 'payment'), 1, 'Informar pagamento', NULL, 'forward', 'financial_agent'),
((SELECT id FROM menus WHERE menu_key = 'payment'), 2, 'Alterar data de vencimento', NULL, 'forward', 'financial_agent'),
((SELECT id FROM menus WHERE menu_key = 'payment'), 3, 'Negociar débitos', NULL, 'forward', 'financial_agent'),
((SELECT id FROM menus WHERE menu_key = 'payment'), 0, 'Voltar', 'financial', NULL, NULL);

-- Inserir opções para o menu de agendamento
INSERT INTO menu_options (menu_id, option_id, title, next_menu, handler) VALUES
((SELECT id FROM menus WHERE menu_key = 'schedule'), 1, 'Instalação', NULL, 'scheduleService'),
((SELECT id FROM menus WHERE menu_key = 'schedule'), 2, 'Manutenção', NULL, 'scheduleService'),
((SELECT id FROM menus WHERE menu_key = 'schedule'), 3, 'Mudança de endereço', NULL, 'scheduleService'),
((SELECT id FROM menus WHERE menu_key = 'schedule'), 0, 'Voltar', 'main', NULL);

-- Inserir opções para o menu de informações
INSERT INTO menu_options (menu_id, option_id, title, next_menu, handler) VALUES
((SELECT id FROM menus WHERE menu_key = 'info'), 1, 'Horário de atendimento', NULL, 'showBusinessHours'),
((SELECT id FROM menus WHERE menu_key = 'info'), 2, 'Contatos', 'contacts', NULL),
((SELECT id FROM menus WHERE menu_key = 'info'), 3, 'Endereço da empresa', NULL, 'showAddress'),
((SELECT id FROM menus WHERE menu_key = 'info'), 0, 'Voltar', 'main', NULL);

-- Inserir opções para o menu de contatos
INSERT INTO menu_options (menu_id, option_id, title, next_menu, handler, config_key) VALUES
((SELECT id FROM menus WHERE menu_key = 'contacts'), 1, 'Telefone fixo', NULL, 'showPhoneNumber', NULL),
((SELECT id FROM menus WHERE menu_key = 'contacts'), 2, 'E-mail', NULL, 'showEmail', NULL),
((SELECT id FROM menus WHERE menu_key = 'contacts'), 3, 'WhatsApp', NULL, 'showWhatsApp', NULL),
((SELECT id FROM menus WHERE menu_key = 'contacts'), 0, 'Voltar', 'info', NULL, NULL);

-- Inserir configurações padrão
INSERT INTO configs (key_name, key_value) VALUES
('commercial_agent', '5511999999991'),
('support_agent', '5511999999992'),
('financial_agent', '5511999999993'),
('scheduling_agent', '5511999999994'),
('lgpd_agent', '5511999999995'),
('lgpd_terms_path', './resources/termos_lgpd.pdf'),
('business_hours_start_morning', '9'),
('business_hours_end_morning', '12'),
('business_hours_start_afternoon', '13'),
('business_hours_end_afternoon', '17'),
('session_timeout_minutes', '360'),
('visit_price', '150.00'),
('pix_key', '12345678901234'),
('pix_key_name', 'Empresa Internet Ltda'),
('pix_key_type', 'CNPJ'),
('pix_qrcode_path', './resources/pix_qrcode.png'),
('invoices_directory', './invoices'),
('api_key', 'secret_api_key_for_external_systems'),
('welcome_message', 'Olá! Bem-vindo ao nosso atendimento automatizado. Como posso ajudar?');

-- Inserir textos personalizados
INSERT INTO custom_texts (text_key, text_value) VALUES
('first_welcome', 'Olá! Bem-vindo ao nosso atendimento. Para começarmos, precisamos de algumas informações básicas.'),
('ask_name', 'Por favor, informe seu nome completo:'),
('ask_email', 'Agora, informe seu e-mail:'),
('ask_address', 'Por favor, informe seu endereço completo:'),
('ask_address_complement', 'Informe o complemento do endereço (apartamento, bloco, etc):'),
('lgpd_terms_message', 'Obrigado pelos seus dados! Para prosseguir, precisamos que você leia e aceite nossos termos de uso e política de privacidade, em conformidade com a Lei Geral de Proteção de Dados (LGPD).'),
('lgpd_accept_message', 'Após ler os termos, por favor, confirme:\n\n*1.* Eu aceito os termos\n*2.* Eu não aceito'),
('lgpd_simplified_terms', 'Ao prosseguir, você concorda com nossos termos de uso e privacidade, que incluem o armazenamento e processamento dos seus dados para fins de atendimento, em conformidade com a Lei Geral de Proteção de Dados (LGPD).\n\n*1.* Eu aceito\n*2.* Eu não aceito'),
('terms_accepted', 'Obrigado por aceitar os termos! Agora você pode acessar todos os nossos serviços.'),
('terms_rejected', 'Entendemos sua decisão. Infelizmente, não podemos prosseguir com o atendimento sem o aceite dos termos, conforme exigido pela legislação. Caso mude de ideia, estamos à disposição.'),
('terms_rejected_forward', 'Entendemos sua decisão. Para garantir que possamos atendê-lo adequadamente sem utilizar seus dados, vamos transferi-lo para um atendente especializado.'),
('invalid_option', 'Opção inválida. Por favor, selecione uma opção válida:'),
('menu_not_found', 'Menu não disponível no momento. Voltando ao menu principal...'),
('scheduling_welcome', 'Bem-vindo ao nosso sistema de agendamento de visitas técnicas. Vamos ajudá-lo a marcar o melhor horário para você!'),
('schedule_desc', 'Por favor, descreva brevemente o problema ou serviço que precisa:'),
('checking_availability', 'Estou verificando nossa agenda com os horários disponíveis para você.'),
('no_slots_available', 'Não encontramos horários disponíveis para os próximos dias.'),
('available_slots_header', 'Temos os seguintes horários disponíveis para sua visita técnica:\n\n'),
('appointment_error', 'Ocorreu um erro ao agendar. Por favor, tente novamente mais tarde.'),
('appointment_cancelled', 'Agendamento cancelado.'),
('reschedule_prompt', 'Vamos tentar novamente. Por favor, descreva brevemente o problema ou serviço que precisa:'),
('forwarding', 'Transferindo para o atendente...'),
('queue_position', 'Você está na posição {position} da fila. Aguarde, por favor.'),
('queue_position_update', 'Atualização: você agora está na posição {position} da fila.'),
('service_ended', 'Atendimento finalizado. Obrigado por escolher nossos serviços!'),
('service_starting', 'Seu atendimento está começando agora.'),
('no_agent', 'Você não está em atendimento no momento.'),
('rating_request', 'Gostaríamos de saber como foi sua experiência conosco.\nPor favor, avalie nosso atendimento de 1 a 5\n\n1. ⭐ - Péssimo\n2. ⭐⭐ - Ruim\n3. ⭐⭐⭐ - Regular\n4. ⭐⭐⭐⭐ - Bom\n5. ⭐⭐⭐⭐⭐ - Excelente'),
('invalid_rating', 'Por favor, digite um número de 1 a 5:'),
('rating_comment', 'Gostaria de adicionar algum comentário? (digite seu comentário ou "pular" para finalizar)'),
('rating_thank_you', 'Obrigado pelo seu feedback! Sua opinião é muito importante para melhorarmos nossos serviços.'),
('goodbye_message', 'Obrigado por utilizar nossos serviços! Estamos à disposição quando precisar novamente.'),
('pix_message', '💰 *Nossa Chave PIX*\n\n{type}: {key}\nNome: {name}\n\nVocê pode copiar a chave acima ou usar o QR Code. Após realizar o pagamento, envie o comprovante para nosso atendente.'),
('anything_else', 'Posso ajudar com mais alguma coisa?'),
('no_invoices', 'Não encontramos boletos pendentes para seu cadastro. Se precisar de ajuda, selecione a opção de falar com um atendente.'),
('invoices_list_header', 'Encontramos os seguintes boletos para seu cadastro:\n\n'),
('sending_invoice', 'Estamos enviando a 2ª via do boleto selecionado. Por favor, aguarde um momento...'),
('invoice_sent', 'Seu boleto foi enviado com sucesso. Caso tenha alguma dúvida, selecione a opção de falar com um atendente.'),
('postsale_initial_message', 'Olá {client_name}, vimos que o técnico finalizou sua {service_type}. Gostaríamos de saber como foi sua experiência conosco!'),
('postsale_rating_request', 'Por favor, avalie nosso serviço de 1 a 5 estrelas:\n\n1 ⭐ - Péssimo\n2 ⭐⭐ - Ruim\n3 ⭐⭐⭐ - Regular\n4 ⭐⭐⭐⭐ - Bom\n5 ⭐⭐⭐⭐⭐ - Excelente'),
('postsale_comment_request', 'Agora, por favor, descreva uma crítica ou elogio para que possamos melhorar cada vez mais nosso atendimento (ou escreva "pular" para continuar):'),
('postsale_recommendation_question', 'Qual a chance de nos recomendar para um amigo ou familiar?\n\n1 - Vou sempre indicar\n2 - Talvez indique\n3 - Se não tiver outra opção\n4 - Não indicaria'),
('postsale_thank_you', 'Muito obrigado por participar da nossa pesquisa de satisfação! Seu feedback é muito importante para continuarmos melhorando nosso atendimento.');

-- Inserir preços de serviços
INSERT INTO service_prices (service_type, price) VALUES
('Instalação', 150.00),
('Manutenção', 100.00),
('Visita Técnica', 120.00),
('Mudança de Endereço', 200.00),
('Troca de Equipamento', 80.00),
('Reparo Externo', 180.00),
('Reparo Interno', 120.00),
('Configuração de Rede', 80.00),
('Instalação de Câmeras', 250.00),
('Configuração de Roteador', 50.00);

-- Inserir usuário de teste
INSERT INTO users (phone, name, email, address) VALUES
('5511987654321', 'Cliente Teste', 'teste@exemplo.com', 'Rua de Teste, 123');

-- Inserir um número bloqueado de exemplo
INSERT INTO blocked_numbers (phone) VALUES
('5511912345678');

-- Inserir configurações de API Google Calendar
INSERT INTO api_configs (api_name, client_id, client_secret, refresh_token, calendar_id) VALUES
('google_calendar', '144055019340-0kecbh0rh6e601cmtocmgki0uu76f9ag.apps.googleusercontent.com', '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', '', 'primary');

-- Boletos de exemplo para o usuário de teste
INSERT INTO invoices (user_id, reference, amount, due_date, paid, pdf_path) VALUES
((SELECT id FROM users WHERE phone = '5511987654321'), 'INV-2023-001', 99.90, DATE_ADD(CURRENT_DATE, INTERVAL 5 DAY), FALSE, './invoices/boleto_1.pdf'),
((SELECT id FROM users WHERE phone = '5511987654321'), 'INV-2023-002', 99.90, DATE_ADD(CURRENT_DATE, INTERVAL -25 DAY), TRUE, './invoices/boleto_2.pdf');

-- Inserir configuração de pós-venda inicial
INSERT INTO postsale_settings (setting, value) VALUES
('postsale_pending', 'false');