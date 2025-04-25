/**
 * Rotas para gerenciamento de menus do bot
 * Funcionalidades:
 * - Listar todos os menus
 * - Buscar menu por ID
 * - Criar novos menus
 * - Atualizar menus existentes
 * - Excluir menus
 * - Organizar estrutura hierárquica dos menus
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const db = require('../backend/database');

// Obter todos os menus
router.get('/', verifyToken, async (req, res) => {
  try {
    const [menus] = await db.promise().query(
      `SELECT m.*, 
       (SELECT COUNT(*) FROM menu_items WHERE parent_id = m.id) as children_count 
       FROM menu_items m 
       ORDER BY m.position ASC`
    );
    res.json(menus);
  } catch (error) {
    console.error('Erro ao buscar menus:', error);
    res.status(500).json({ error: 'Erro ao buscar menus' });
  }
});

// Obter estrutura completa do menu
router.get('/structure', verifyToken, async (req, res) => {
  try {
    // Primeiro, obtemos todos os menus raiz (parent_id é NULL)
    const [rootMenus] = await db.promise().query(
      `SELECT * FROM menu_items WHERE parent_id IS NULL ORDER BY position ASC`
    );
    
    // Função recursiva para obter submenus
    const getSubmenusByParentId = async (parentId) => {
      const [submenus] = await db.promise().query(
        `SELECT * FROM menu_items WHERE parent_id = ? ORDER BY position ASC`,
        [parentId]
      );
      
      // Para cada submenu, buscamos seus filhos recursivamente
      const submenuWithChildren = await Promise.all(
        submenus.map(async (submenu) => {
          const children = await getSubmenusByParentId(submenu.id);
          return {
            ...submenu,
            children: children
          };
        })
      );
      
      return submenuWithChildren;
    };
    
    // Para cada menu raiz, buscamos seus filhos
    const menuStructure = await Promise.all(
      rootMenus.map(async (menu) => {
        const submenus = await getSubmenusByParentId(menu.id);
        return {
          ...menu,
          children: submenus
        };
      })
    );
    
    res.json(menuStructure);
  } catch (error) {
    console.error('Erro ao buscar estrutura de menus:', error);
    res.status(500).json({ error: 'Erro ao buscar estrutura de menus' });
  }
});

// Obter um menu específico
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const [menus] = await db.promise().query(
      `SELECT * FROM menu_items WHERE id = ?`,
      [id]
    );
    
    if (menus.length === 0) {
      return res.status(404).json({ error: 'Menu não encontrado' });
    }
    
    // Buscar também os filhos diretos deste menu
    const [children] = await db.promise().query(
      `SELECT * FROM menu_items WHERE parent_id = ? ORDER BY position ASC`,
      [id]
    );
    
    res.json({
      ...menus[0],
      children
    });
  } catch (error) {
    console.error('Erro ao buscar menu:', error);
    res.status(500).json({ error: 'Erro ao buscar menu' });
  }
});

// Criar um novo menu
router.post('/', verifyToken, async (req, res) => {
  try {
    const { 
      title, 
      description, 
      type, 
      parent_id, 
      action_type, 
      action_data, 
      position,
      is_active
    } = req.body;
    
    // Validar dados
    if (!title) {
      return res.status(400).json({ error: 'O título do menu é obrigatório' });
    }
    
    // Se tem parent_id, verificar se o menu pai existe
    if (parent_id) {
      const [parentMenu] = await db.promise().query(
        'SELECT id FROM menu_items WHERE id = ?',
        [parent_id]
      );
      
      if (parentMenu.length === 0) {
        return res.status(400).json({ error: 'Menu pai não encontrado' });
      }
    }
    
    // Se não for informada a posição, colocar na última posição
    let menuPosition = position;
    if (menuPosition === undefined) {
      const [lastPosition] = await db.promise().query(
        'SELECT MAX(position) as max_pos FROM menu_items WHERE parent_id IS NULL',
        [parent_id]
      );
      menuPosition = (lastPosition[0].max_pos || 0) + 1;
    }
    
    // Inserir o novo menu
    const [result] = await db.promise().query(
      `INSERT INTO menu_items 
       (title, description, type, parent_id, action_type, action_data, position, is_active, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [title, description, type, parent_id || null, action_type, action_data, menuPosition, is_active || 1]
    );
    
    const newMenuId = result.insertId;
    
    // Buscar o menu recém-criado
    const [newMenu] = await db.promise().query(
      `SELECT * FROM menu_items WHERE id = ?`,
      [newMenuId]
    );
    
    res.status(201).json(newMenu[0]);
  } catch (error) {
    console.error('Erro ao criar menu:', error);
    res.status(500).json({ error: 'Erro ao criar menu' });
  }
});

// Atualizar um menu existente
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      description, 
      type, 
      parent_id, 
      action_type, 
      action_data, 
      position,
      is_active
    } = req.body;
    
    // Verificar se o menu existe
    const [existingMenu] = await db.promise().query(
      'SELECT id FROM menu_items WHERE id = ?',
      [id]
    );
    
    if (existingMenu.length === 0) {
      return res.status(404).json({ error: 'Menu não encontrado' });
    }
    
    // Validar parent_id para evitar ciclos (um menu não pode ser pai de si mesmo ou de seus ancestrais)
    if (parent_id) {
      // Verificar se não está tentando definir o próprio menu como pai
      if (parseInt(parent_id) === parseInt(id)) {
        return res.status(400).json({ error: 'Um menu não pode ser pai de si mesmo' });
      }
      
      // Função recursiva para verificar se o parent_id faz parte dos ancestrais
      const checkAncestors = async (menuId, targetId) => {
        const [menu] = await db.promise().query(
          'SELECT parent_id FROM menu_items WHERE id = ?',
          [menuId]
        );
        
        if (menu.length === 0 || menu[0].parent_id === null) {
          return false;
        }
        
        if (parseInt(menu[0].parent_id) === parseInt(targetId)) {
          return true;
        }
        
        return await checkAncestors(menu[0].parent_id, targetId);
      };
      
      const isAncestor = await checkAncestors(parent_id, id);
      if (isAncestor) {
        return res.status(400).json({ error: 'Ciclo detectado na hierarquia de menus' });
      }
    }
    
    // Atualizar o menu
    await db.promise().query(
      `UPDATE menu_items SET 
       title = ?, 
       description = ?, 
       type = ?, 
       parent_id = ?, 
       action_type = ?, 
       action_data = ?, 
       position = ?,
       is_active = ?,
       updated_at = NOW()
       WHERE id = ?`,
      [
        title, 
        description, 
        type, 
        parent_id || null, 
        action_type, 
        action_data, 
        position, 
        is_active,
        id
      ]
    );
    
    // Buscar o menu atualizado
    const [updatedMenu] = await db.promise().query(
      `SELECT * FROM menu_items WHERE id = ?`,
      [id]
    );
    
    res.json(updatedMenu[0]);
  } catch (error) {
    console.error('Erro ao atualizar menu:', error);
    res.status(500).json({ error: 'Erro ao atualizar menu' });
  }
});

// Excluir um menu e seus filhos
router.delete('/:id', verifyToken, async (req, res) => {
  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    
    // Função recursiva para excluir todos os submenus
    const deleteSubmenusCascade = async (menuId) => {
      // Buscar todos os filhos deste menu
      const [children] = await connection.query(
        'SELECT id FROM menu_items WHERE parent_id = ?',
        [menuId]
      );
      
      // Para cada filho, chamar a função recursivamente
      for (const child of children) {
        await deleteSubmenusCascade(child.id);
      }
      
      // Excluir o menu atual
      await connection.query('DELETE FROM menu_items WHERE id = ?', [menuId]);
    };
    
    // Iniciar o processo de exclusão
    await deleteSubmenusCascade(id);
    
    await connection.commit();
    res.json({ message: 'Menu e submenus excluídos com sucesso' });
  } catch (error) {
    await connection.rollback();
    console.error('Erro ao excluir menu:', error);
    res.status(500).json({ error: 'Erro ao excluir menu' });
  } finally {
    connection.release();
  }
});

// Reordenar menus
router.post('/reorder', verifyToken, async (req, res) => {
  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { items } = req.body;
    
    if (!Array.isArray(items)) {
      await connection.rollback();
      return res.status(400).json({ error: 'Formato inválido. Envie um array de itens.' });
    }
    
    // Atualizar a posição de cada item
    for (const item of items) {
      if (!item.id || item.position === undefined) {
        continue;
      }
      
      await connection.query(
        'UPDATE menu_items SET position = ?, parent_id = ? WHERE id = ?',
        [item.position, item.parent_id || null, item.id]
      );
    }
    
    await connection.commit();
    res.json({ message: 'Menus reordenados com sucesso' });
  } catch (error) {
    await connection.rollback();
    console.error('Erro ao reordenar menus:', error);
    res.status(500).json({ error: 'Erro ao reordenar menus' });
  } finally {
    connection.release();
  }
});

// Obter dados do menu para o bot do WhatsApp
router.get('/whatsapp/structure', async (req, res) => {
  try {
    // Apenas menus ativos serão mostrados ao bot
    const [rootMenus] = await db.promise().query(
      `SELECT id, title, description, type, action_type, action_data 
       FROM menu_items 
       WHERE parent_id IS NULL AND is_active = 1 
       ORDER BY position ASC`
    );
    
    // Função recursiva para obter submenus ativos
    const getActiveSubmenus = async (parentId) => {
      const [submenus] = await db.promise().query(
        `SELECT id, title, description, type, action_type, action_data 
         FROM menu_items 
         WHERE parent_id = ? AND is_active = 1 
         ORDER BY position ASC`,
        [parentId]
      );
      
      // Para cada submenu, buscamos seus filhos ativos
      const submenuWithChildren = await Promise.all(
        submenus.map(async (submenu) => {
          const children = await getActiveSubmenus(submenu.id);
          return {
            ...submenu,
            children: children
          };
        })
      );
      
      return submenuWithChildren;
    };
    
    // Para cada menu raiz, buscamos seus filhos ativos
    const menuStructure = await Promise.all(
      rootMenus.map(async (menu) => {
        const submenus = await getActiveSubmenus(menu.id);
        return {
          ...menu,
          children: submenus
        };
      })
    );
    
    res.json(menuStructure);
  } catch (error) {
    console.error('Erro ao buscar estrutura de menus para WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao buscar estrutura de menus' });
  }
});

// Duplicar um menu e seus submenus
router.post('/:id/duplicate', verifyToken, async (req, res) => {
  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    
    // Verificar se o menu existe
    const [existingMenu] = await connection.query(
      'SELECT * FROM menu_items WHERE id = ?',
      [id]
    );
    
    if (existingMenu.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Menu não encontrado' });
    }
    
    // Função para duplicar um menu e retornar o novo ID
    const duplicateMenu = async (menu, newParentId = null) => {
      // Criar cópia do menu
      const [result] = await connection.query(
        `INSERT INTO menu_items 
         (title, description, type, parent_id, action_type, action_data, position, is_active, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          `${menu.title} (Cópia)`, 
          menu.description, 
          menu.type, 
          newParentId, 
          menu.action_type, 
          menu.action_data, 
          menu.position + 1, 
          menu.is_active,
        ]
      );
      
      const newMenuId = result.insertId;
      
      // Buscar submenus e duplicá-los também
      const [children] = await connection.query(
        'SELECT * FROM menu_items WHERE parent_id = ?',
        [menu.id]
      );
      
      // Duplicar cada filho
      for (const child of children) {
        await duplicateMenu(child, newMenuId);
      }
      
      return newMenuId;
    };
    
    // Iniciar o processo de duplicação
    const newMenuId = await duplicateMenu(existingMenu[0]);
    
    await connection.commit();
    
    // Buscar o novo menu com seus filhos
    const [newMenu] = await db.promise().query(
      `SELECT * FROM menu_items WHERE id = ?`,
      [newMenuId]
    );
    
    res.status(201).json(newMenu[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Erro ao duplicar menu:', error);
    res.status(500).json({ error: 'Erro ao duplicar menu' });
  } finally {
    connection.release();
  }
});

module.exports = router;