-- Tabelas para gerenciamento de conexões WhatsApp

-- Tabela principal de conexões
CREATE TABLE IF NOT EXISTS whatsapp_connections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type ENUM('bot', 'agent') NOT NULL DEFAULT 'bot',
    agent_type VARCHAR(50),
    phone VARCHAR(20),
    status ENUM('connected', 'disconnected', 'connecting') DEFAULT 'disconnected',
    device_info TEXT,
    connected_at DATETIME,
    disconnected_at DATETIME,
    auth_data LONGTEXT,
    max_sessions INT DEFAULT 10,
    active BOOLEAN DEFAULT TRUE,
    all_menus BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (phone),
    INDEX (status),
    INDEX (type)
) ENGINE=InnoDB;

-- Tabela para menus atribuídos a conexões
CREATE TABLE IF NOT EXISTS whatsapp_connection_menus (
    id INT AUTO_INCREMENT PRIMARY KEY,
    connection_id INT NOT NULL,
    menu_key VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
    UNIQUE KEY (connection_id, menu_key)
) ENGINE=InnoDB;

-- Tabela para estatísticas de conexões
CREATE TABLE IF NOT EXISTS whatsapp_connection_stats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    connection_id INT NOT NULL,
    messages_sent INT DEFAULT 0,
    messages_received INT DEFAULT 0,
    sessions_count INT DEFAULT 0,
    schedules_count INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
    UNIQUE KEY (connection_id)
) ENGINE=InnoDB;

-- Inserir conexão padrão para o bot principal
INSERT INTO whatsapp_connections (name, type, status)
VALUES ('Bot Principal', 'bot', 'disconnected')
ON DUPLICATE KEY UPDATE name = 'Bot Principal';

-- Inserir estatísticas iniciais para a conexão padrão
INSERT INTO whatsapp_connection_stats (connection_id, messages_sent, messages_received)
SELECT id, 0, 0 FROM whatsapp_connections WHERE name = 'Bot Principal'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- Adicionar flag para habilitar múltiplas conexões na tabela de configurações
INSERT INTO configs (key_name, key_value)
VALUES ('enable_multiple_connections', 'true')
ON DUPLICATE KEY UPDATE key_value = key_value;