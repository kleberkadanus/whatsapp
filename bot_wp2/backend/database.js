/**
 * database.js - Módulo de conexão e operações do banco de dados
 * 
 * Este módulo gerencia a conexão com o banco de dados MySQL e
 * fornece funções para realizar operações comuns.
 */

// Importar dependências
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Carregar configurações do banco de dados
const dbConfig = require('../config/database.config');

// Pool de conexões para melhor desempenho
let pool = null;

/**
 * Inicializa a conexão com o banco de dados
 * @returns {Promise} Promise que resolve quando a conexão é estabelecida
 */
async function init() {
  try {
    // Criar pool de conexões
    pool = mysql.createPool({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    
    // Verificar conexão
    const connection = await pool.getConnection();
    console.log('Conexão com o banco de dados estabelecida com sucesso');
    connection.release();
    
    // Verificar se as tabelas necessárias existem
    await checkTables();
    
    return true;
  } catch (error) {
    console.error('Erro ao inicializar o banco de dados:', error);
    throw error;
  }
}

/**
 * Verifica se as tabelas necessárias existem e as cria se não existirem
 * @returns {Promise} Promise que resolve quando a verificação é concluída
 */
async function checkTables() {
  try {
    // Carregar scripts SQL de criação de tabelas
    const sqlFilePath = path.join(__dirname, '../sql/create_database.sql');
    const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Dividir o script em consultas individuais
    const queries = sqlScript
      .split(';')
      .filter(query => query.trim().length > 0)
      .map(query => query.trim() + ';');
    
    // Executar cada consulta
    for (const query of queries) {
      await pool.query(query);
    }
    
    console.log('Tabelas verificadas e atualizadas com sucesso');
    return true;
  } catch (error) {
    console.error('Erro ao verificar tabelas:', error);
    throw error;
  }
}

/**
 * Executa uma consulta no banco de dados
 * @param {string} sql - Consulta SQL a ser executada
 * @param {Array} params - Parâmetros para a consulta
 * @returns {Promise} Promise com o resultado da consulta
 */
async function query(sql, params = []) {
  try {
    const [rows, fields] = await pool.query(sql, params);
    return rows;
  } catch (error) {
    console.error('Erro ao executar consulta:', error);
    console.error('SQL:', sql);
    console.error('Parâmetros:', params);
    throw error;
  }
}

/**
 * Insere um registro em uma tabela
 * @param {string} table - Nome da tabela
 * @param {Object} data - Dados a serem inseridos
 * @returns {Promise} Promise com o resultado da inserção
 */
async function insert(table, data) {
  try {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    const [result] = await pool.query(sql, values);
    
    return {
      id: result.insertId,
      affectedRows: result.affectedRows
    };
  } catch (error) {
    console.error(`Erro ao inserir em ${table}:`, error);
    throw error;
  }
}

/**
 * Atualiza registros em uma tabela
 * @param {string} table - Nome da tabela
 * @param {Object} data - Dados a serem atualizados
 * @param {Object} where - Condições para atualização
 * @returns {Promise} Promise com o resultado da atualização
 */
async function update(table, data, where) {
  try {
    const dataKeys = Object.keys(data);
    const dataValues = Object.values(data);
    
    const whereKeys = Object.keys(where);
    const whereValues = Object.values(where);
    
    const setClause = dataKeys.map(key => `${key} = ?`).join(', ');
    const whereClause = whereKeys.map(key => `${key} = ?`).join(' AND ');
    
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    const [result] = await pool.query(sql, [...dataValues, ...whereValues]);
    
    return {
      affectedRows: result.affectedRows,
      changedRows: result.changedRows
    };
  } catch (error) {
    console.error(`Erro ao atualizar ${table}:`, error);
    throw error;
  }
}

/**
 * Remove registros de uma tabela
 * @param {string} table - Nome da tabela
 * @param {Object} where - Condições para remoção
 * @returns {Promise} Promise com o resultado da remoção
 */
async function remove(table, where) {
  try {
    const keys = Object.keys(where);
    const values = Object.values(where);
    
    const whereClause = keys.map(key => `${key} = ?`).join(' AND ');
    
    const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
    const [result] = await pool.query(sql, values);
    
    return {
      affectedRows: result.affectedRows
    };
  } catch (error) {
    console.error(`Erro ao remover de ${table}:`, error);
    throw error;
  }
}

/**
 * Busca registros em uma tabela
 * @param {string} table - Nome da tabela
 * @param {Object} where - Condições da busca
 * @param {string} orderBy - Campo para ordenação
 * @param {string} order - Direção da ordenação (ASC/DESC)
 * @param {number} limit - Limite de registros
 * @param {number} offset - Deslocamento para paginação
 * @returns {Promise} Promise com os registros encontrados
 */
async function find(table, where = {}, orderBy = null, order = 'ASC', limit = null, offset = 0) {
  try {
    const keys = Object.keys(where);
    const values = Object.values(where);
    
    let sql = `SELECT * FROM ${table}`;
    
    // Construir cláusula WHERE
    if (keys.length > 0) {
      const whereClause = keys.map(key => `${key} = ?`).join(' AND ');
      sql += ` WHERE ${whereClause}`;
    }
    
    // Adicionar ordenação
    if (orderBy) {
      sql += ` ORDER BY ${orderBy} ${order}`;
    }
    
    // Adicionar limite e deslocamento
    if (limit !== null) {
      sql += ` LIMIT ${offset}, ${limit}`;
    }
    
    const [rows] = await pool.query(sql, values);
    return rows;
  } catch (error) {
    console.error(`Erro ao buscar em ${table}:`, error);
    throw error;
  }
}

/**
 * Busca um único registro em uma tabela
 * @param {string} table - Nome da tabela
 * @param {Object} where - Condições da busca
 * @returns {Promise} Promise com o registro encontrado ou null
 */
async function findOne(table, where) {
  try {
    const rows = await find(table, where, null, 'ASC', 1);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error(`Erro ao buscar registro único em ${table}:`, error);
    throw error;
  }
}

/**
 * Conta registros em uma tabela
 * @param {string} table - Nome da tabela
 * @param {Object} where - Condições da contagem
 * @returns {Promise} Promise com o número de registros
 */
async function count(table, where = {}) {
  try {
    const keys = Object.keys(where);
    const values = Object.values(where);
    
    let sql = `SELECT COUNT(*) as count FROM ${table}`;
    
    // Construir cláusula WHERE
    if (keys.length > 0) {
      const whereClause = keys.map(key => `${key} = ?`).join(' AND ');
      sql += ` WHERE ${whereClause}`;
    }
    
    const [rows] = await pool.query(sql, values);
    return rows[0].count;
  } catch (error) {
    console.error(`Erro ao contar registros em ${table}:`, error);
    throw error;
  }
}

/**
 * Executa uma busca avançada usando SQL personalizado
 * @param {string} sql - Consulta SQL a ser executada
 * @param {Array} params - Parâmetros para a consulta
 * @returns {Promise} Promise com o resultado da consulta
 */
async function search(sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (error) {
    console.error('Erro ao executar busca avançada:', error);
    throw error;
  }
}

/**
 * Executa uma transação no banco de dados
 * @param {Function} callback - Função que executa operações dentro da transação
 * @returns {Promise} Promise com o resultado da transação
 */
async function transaction(callback) {
  let connection;
  
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    const result = await callback(connection);
    
    await connection.commit();
    return result;
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Erro na transação:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Fecha a conexão com o banco de dados
 * @returns {Promise} Promise que resolve quando a conexão é fechada
 */
async function close() {
  try {
    if (pool) {
      await pool.end();
      console.log('Conexão com o banco de dados fechada');
    }
    return true;
  } catch (error) {
    console.error('Erro ao fechar conexão com o banco de dados:', error);
    throw error;
  }
}

// Exportar funções públicas
module.exports = {
  init,
  query,
  insert,
  update,
  remove,
  find,
  findOne,
  count,
  search,
  transaction,
  close
};