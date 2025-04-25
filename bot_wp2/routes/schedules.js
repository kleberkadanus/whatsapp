/**
 * Rotas para gerenciamento de agendamentos de visitas técnicas
 * Funcionalidades:
 * - Listar todos os agendamentos
 * - Filtrar agendamentos por data, cliente ou status
 * - Criar novos agendamentos
 * - Atualizar agendamentos existentes
 * - Cancelar agendamentos
 * - Confirmar agendamentos
 * - Integração com o bot de WhatsApp
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const db = require('../backend/database');
const moment = require('moment');

// Obter todos os agendamentos
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, date, client_id, technician_id } = req.query;
    
    let query = `
      SELECT s.*, c.name AS client_name, c.phone AS client_phone, 
      u.name AS technician_name
      FROM schedules s
      LEFT JOIN clients c ON s.client_id = c.id
      LEFT JOIN users u ON s.technician_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Filtrar por status
    if (status) {
      query += ` AND s.status = ?`;
      params.push(status);
    }
    
    // Filtrar por data
    if (date) {
      query += ` AND DATE(s.schedule_date) = ?`;
      params.push(date);
    }
    
    // Filtrar por cliente
    if (client_id) {
      query += ` AND s.client_id = ?`;
      params.push(client_id);
    }
    
    // Filtrar por técnico
    if (technician_id) {
      query += ` AND s.technician_id = ?`;
      params.push(technician_id);
    }
    
    // Ordernar por data/hora
    query += ` ORDER BY s.schedule_date ASC, s.schedule_time ASC`;
    
    const [schedules] = await db.promise().query(query, params);
    
    // Formatar datas para o padrão brasileiro
    const formattedSchedules = schedules.map(schedule => ({
      ...schedule,
      formatted_date: moment(schedule.schedule_date).format('DD/MM/YYYY'),
      formatted_time: schedule.schedule_time.substring(0, 5) // Remover segundos
    }));
    
    res.json(formattedSchedules);
  } catch (error) {
    console.error('Erro ao buscar agendamentos:', error);
    res.status(500).json({ error: 'Erro ao buscar agendamentos' });
  }
});

// Obter agendamentos do dia atual
router.get('/today', verifyToken, async (req, res) => {
  try {
    const today = moment().format('YYYY-MM-DD');
    
    const [schedules] = await db.promise().query(
      `SELECT s.*, c.name AS client_name, c.phone AS client_phone, 
       u.name AS technician_name
       FROM schedules s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.technician_id = u.id
       WHERE DATE(s.schedule_date) = ?
       ORDER BY s.schedule_time ASC`,
      [today]
    );
    
    // Formatar datas para o padrão brasileiro
    const formattedSchedules = schedules.map(schedule => ({
      ...schedule,
      formatted_date: moment(schedule.schedule_date).format('DD/MM/YYYY'),
      formatted_time: schedule.schedule_time.substring(0, 5) // Remover segundos
    }));
    
    res.json(formattedSchedules);
  } catch (error) {
    console.error('Erro ao buscar agendamentos do dia:', error);
    res.status(500).json({ error: 'Erro ao buscar agendamentos do dia' });
  }
});

// Obter agendamentos da semana atual
router.get('/week', verifyToken, async (req, res) => {
  try {
    const startOfWeek = moment().startOf('week').format('YYYY-MM-DD');
    const endOfWeek = moment().endOf('week').format('YYYY-MM-DD');
    
    const [schedules] = await db.promise().query(
      `SELECT s.*, c.name AS client_name, c.phone AS client_phone, 
       u.name AS technician_name
       FROM schedules s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.technician_id = u.id
       WHERE s.schedule_date BETWEEN ? AND ?
       ORDER BY s.schedule_date ASC, s.schedule_time ASC`,
      [startOfWeek, endOfWeek]
    );
    
    // Formatar datas para o padrão brasileiro
    const formattedSchedules = schedules.map(schedule => ({
      ...schedule,
      formatted_date: moment(schedule.schedule_date).format('DD/MM/YYYY'),
      formatted_time: schedule.schedule_time.substring(0, 5) // Remover segundos
    }));
    
    res.json(formattedSchedules);
  } catch (error) {
    console.error('Erro ao buscar agendamentos da semana:', error);
    res.status(500).json({ error: 'Erro ao buscar agendamentos da semana' });
  }
});

// Obter um agendamento específico
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [schedules] = await db.promise().query(
      `SELECT s.*, c.name AS client_name, c.phone AS client_phone, c.email AS client_email,
       c.address AS client_address, u.name AS technician_name
       FROM schedules s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.technician_id = u.id
       WHERE s.id = ?`,
      [id]
    );
    
    if (schedules.length === 0) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }
    
    // Formatar datas para o padrão brasileiro
    const schedule = {
      ...schedules[0],
      formatted_date: moment(schedules[0].schedule_date).format('DD/MM/YYYY'),
      formatted_time: schedules[0].schedule_time.substring(0, 5) // Remover segundos
    };
    
    res.json(schedule);
  } catch (error) {
    console.error('Erro ao buscar agendamento:', error);
    res.status(500).json({ error: 'Erro ao buscar agendamento' });
  }
});

// Criar um novo agendamento
router.post('/', verifyToken, async (req, res) => {
  try {
    const { 
      client_id, 
      technician_id, 
      schedule_date, 
      schedule_time, 
      service_type, 
      notes,
      status
    } = req.body;
    
    // Validar dados
    if (!client_id || !schedule_date || !schedule_time || !service_type) {
      return res.status(400).json({ 
        error: 'Cliente, data, hora e tipo de serviço são obrigatórios' 
      });
    }
    
    // Verificar se o cliente existe
    const [clients] = await db.promise().query(
      'SELECT id FROM clients WHERE id = ?',
      [client_id]
    );
    
    if (clients.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    // Verificar se o técnico existe (se foi informado)
    if (technician_id) {
      const [technicians] = await db.promise().query(
        'SELECT id FROM users WHERE id = ? AND role = "technician"',
        [technician_id]
      );
      
      if (technicians.length === 0) {
        return res.status(404).json({ error: 'Técnico não encontrado' });
      }
    }
    
    // Verificar disponibilidade do horário
    const formattedDate = moment(schedule_date).format('YYYY-MM-DD');
    
    const [existingSchedules] = await db.promise().query(
      `SELECT id FROM schedules 
       WHERE schedule_date = ? 
       AND schedule_time = ? 
       AND status = 'confirmed'
       AND (technician_id = ? OR technician_id IS NULL)`,
      [formattedDate, schedule_time, technician_id || null]
    );
    
    if (existingSchedules.length > 0) {
      return res.status(409).json({ 
        error: 'Já existe um agendamento confirmado para este horário' 
      });
    }
    
    // Inserir o agendamento
    const [result] = await db.promise().query(
      `INSERT INTO schedules 
       (client_id, technician_id, schedule_date, schedule_time, service_type, notes, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        client_id, 
        technician_id || null, 
        formattedDate, 
        schedule_time, 
        service_type, 
        notes || null, 
        status || 'pending'
      ]
    );
    
    const newScheduleId = result.insertId;
    
    // Agendar o lembrete automático
    const reminderHours = 4; // Horas antes para enviar o lembrete
    const scheduleDateTime = moment(`${formattedDate} ${schedule_time}`);
    const reminderDateTime = scheduleDateTime.clone().subtract(reminderHours, 'hours');
    
    // Apenas agendar se o lembrete for no futuro
    if (reminderDateTime.isAfter(moment())) {
      await db.promise().query(
        `INSERT INTO reminders 
         (schedule_id, reminder_time, status, type, created_at) 
         VALUES (?, ?, ?, ?, NOW())`,
        [
          newScheduleId, 
          reminderDateTime.format('YYYY-MM-DD HH:mm:ss'), 
          'pending', 
          'schedule_confirmation'
        ]
      );
    }
    
    // Buscar o agendamento criado com os dados completos
    const [newSchedule] = await db.promise().query(
      `SELECT s.*, c.name AS client_name, u.name AS technician_name
       FROM schedules s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.technician_id = u.id
       WHERE s.id = ?`,
      [newScheduleId]
    );
    
    // Formatar para padrão brasileiro
    const formattedSchedule = {
      ...newSchedule[0],
      formatted_date: moment(newSchedule[0].schedule_date).format('DD/MM/YYYY'),
      formatted_time: newSchedule[0].schedule_time.substring(0, 5)
    };
    
    res.status(201).json(formattedSchedule);
  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

// Atualizar um agendamento
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      client_id, 
      technician_id, 
      schedule_date, 
      schedule_time, 
      service_type, 
      notes,
      status
    } = req.body;
    
    // Verificar se o agendamento existe
    const [existingSchedule] = await db.promise().query(
      'SELECT id, status FROM schedules WHERE id = ?',
      [id]
    );
    
    if (existingSchedule.length === 0) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }
    
    // Impedir alteração de agendamentos cancelados
    if (existingSchedule[0].status === 'cancelled') {
      return res.status(400).json({ 
        error: 'Não é possível alterar um agendamento cancelado' 
      });
    }
    
    // Validar cliente
    if (client_id) {
      const [clients] = await db.promise().query(
        'SELECT id FROM clients WHERE id = ?',
        [client_id]
      );
      
      if (clients.length === 0) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
      }
    }
    
    // Validar técnico
    if (technician_id) {
      const [technicians] = await db.promise().query(
        'SELECT id FROM users WHERE id = ? AND role = "technician"',
        [technician_id]
      );
      
      if (technicians.length === 0) {
        return res.status(404).json({ error: 'Técnico não encontrado' });
      }
    }
    
    // Verificar disponibilidade (apenas se data/hora foi alterada)
    if (schedule_date && schedule_time) {
      const formattedDate = moment(schedule_date).format('YYYY-MM-DD');
      
      const [existingSchedules] = await db.promise().query(
        `SELECT id FROM schedules 
         WHERE schedule_date = ? 
         AND schedule_time = ? 
         AND id != ?
         AND status = 'confirmed'
         AND (technician_id = ? OR technician_id IS NULL)`,
        [formattedDate, schedule_time, id, technician_id || null]
      );
      
      if (existingSchedules.length > 0) {
        return res.status(409).json({ 
          error: 'Já existe um agendamento confirmado para este horário' 
        });
      }
    }
    
    // Preparar a query de atualização
    let updateQuery = 'UPDATE schedules SET updated_at = NOW()';
    const updateParams = [];
    
    if (client_id) {
      updateQuery += ', client_id = ?';
      updateParams.push(client_id);
    }
    
    if (technician_id !== undefined) {
      updateQuery += ', technician_id = ?';
      updateParams.push(technician_id || null);
    }
    
    if (schedule_date) {
      updateQuery += ', schedule_date = ?';
      updateParams.push(moment(schedule_date).format('YYYY-MM-DD'));
    }
    
    if (schedule_time) {
      updateQuery += ', schedule_time = ?';
      updateParams.push(schedule_time);
    }
    
    if (service_type) {
      updateQuery += ', service_type = ?';
      updateParams.push(service_type);
    }
    
    if (notes !== undefined) {
      updateQuery += ', notes = ?';
      updateParams.push(notes || null);
    }
    
    if (status) {
      updateQuery += ', status = ?';
      updateParams.push(status);
    }
    
    updateQuery += ' WHERE id = ?';
    updateParams.push(id);
    
    // Atualizar o agendamento
    await db.promise().query(updateQuery, updateParams);
    
    // Se o status foi alterado para cancelado, cancelar também os lembretes
    if (status === 'cancelled') {
      await db.promise().query(
        'UPDATE reminders SET status = "cancelled" WHERE schedule_id = ?',
        [id]
      );
    }
    
    // Se data/hora foi alterada, atualizar o lembrete
    if ((schedule_date || schedule_time) && status !== 'cancelled') {
      // Obter os dados atualizados do agendamento
      const [updatedSchedule] = await db.promise().query(
        'SELECT schedule_date, schedule_time FROM schedules WHERE id = ?',
        [id]
      );
      
      if (updatedSchedule.length > 0) {
        const reminderHours = 4; // Horas antes para enviar o lembrete
        const scheduleDateTime = moment(
          `${updatedSchedule[0].schedule_date} ${updatedSchedule[0].schedule_time}`
        );
        const reminderDateTime = scheduleDateTime.clone().subtract(reminderHours, 'hours');
        
        // Verificar se já existe um lembrete
        const [existingReminders] = await db.promise().query(
          'SELECT id FROM reminders WHERE schedule_id = ? AND type = "schedule_confirmation"',
          [id]
        );
        
        if (existingReminders.length > 0) {
          // Atualizar o lembrete existente
          await db.promise().query(
            `UPDATE reminders SET 
             reminder_time = ?, 
             status = ?, 
             updated_at = NOW() 
             WHERE id = ?`,
            [
              reminderDateTime.format('YYYY-MM-DD HH:mm:ss'),
              'pending',
              existingReminders[0].id
            ]
          );
        } else if (reminderDateTime.isAfter(moment())) {
          // Criar um novo lembrete se não existir
          await db.promise().query(
            `INSERT INTO reminders 
             (schedule_id, reminder_time, status, type, created_at) 
             VALUES (?, ?, ?, ?, NOW())`,
            [
              id, 
              reminderDateTime.format('YYYY-MM-DD HH:mm:ss'), 
              'pending', 
              'schedule_confirmation'
            ]
          );
        }
      }
    }
    
    // Buscar o agendamento atualizado
    const [updatedSchedule] = await db.promise().query(
      `SELECT s.*, c.name AS client_name, u.name AS technician_name
       FROM schedules s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.technician_id = u.id
       WHERE s.id = ?`,
      [id]
    );
    
    // Formatar para padrão brasileiro
    const formattedSchedule = {
      ...updatedSchedule[0],
      formatted_date: moment(updatedSchedule[0].schedule_date).format('DD/MM/YYYY'),
      formatted_time: updatedSchedule[0].schedule_time.substring(0, 5)
    };
    
    res.json(formattedSchedule);
  } catch (error) {
    console.error('Erro ao atualizar agendamento:', error);
    res.status(500).json({ error: 'Erro ao atualizar agendamento' });
  }
});

// Cancelar um agendamento
router.patch('/:id/cancel', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    // Verificar se o agendamento existe
    const [existingSchedule] = await db.promise().query(
      'SELECT id, status FROM schedules WHERE id = ?',
      [id]
    );
    
    if (existingSchedule.length === 0) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }
    
    // Não permitir cancelar agendamentos já cancelados
    if (existingSchedule[0].status === 'cancelled') {
      return res.status(400).json({ error: 'Agendamento já está cancelado' });
    }
    
    // Atualizar o status para cancelado
    await db.promise().query(
      `UPDATE schedules SET 
       status = 'cancelled', 
       cancellation_reason = ?,
       updated_at = NOW() 
       WHERE id = ?`,
      [reason || null, id]
    );
    
    // Cancelar os lembretes associados
    await db.promise().query(
      'UPDATE reminders SET status = "cancelled" WHERE schedule_id = ?',
      [id]
    );
    
    res.json({ message: 'Agendamento cancelado com sucesso' });
  } catch (error) {
    console.error('Erro ao cancelar agendamento:', error);
    res.status(500).json({ error: 'Erro ao cancelar agendamento' });
  }
});

// Confirmar um agendamento
router.patch('/:id/confirm', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar se o agendamento existe
    const [existingSchedule] = await db.promise().query(
      'SELECT id, status FROM schedules WHERE id = ?',
      [id]
    );
    
    if (existingSchedule.length === 0) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }
    
    // Não permitir confirmar agendamentos cancelados
    if (existingSchedule[0].status === 'cancelled') {
      return res.status(400).json({ 
        error: 'Não é possível confirmar um agendamento cancelado' 
      });
    }
    
    // Atualizar o status para confirmado
    await db.promise().query(
      `UPDATE schedules SET 
       status = 'confirmed', 
       updated_at = NOW() 
       WHERE id = ?`,
      [id]
    );
    
    res.json({ message: 'Agendamento confirmado com sucesso' });
  } catch (error) {
    console.error('Erro ao confirmar agendamento:', error);
    res.status(500).json({ error: 'Erro ao confirmar agendamento' });
  }
});

// Obter slots de horários disponíveis para uma data
router.get('/available-slots/:date', verifyToken, async (req, res) => {
  try {
    const { date } = req.params;
    const { technician_id } = req.query;
    
    // Validar formato da data
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({ error: 'Formato de data inválido. Use YYYY-MM-DD.' });
    }
    
    // Configurações de horários de trabalho
    const workDayStart = '08:00:00';
    const workDayEnd = '18:00:00';
    const slotDuration = 60; // minutos
    const lunchBreakStart = '12:00:00';
    const lunchBreakEnd = '13:00:00';
    
    // Buscar agendamentos existentes para a data
    let query = `
      SELECT schedule_time 
      FROM schedules 
      WHERE schedule_date = ? 
      AND status IN ('confirmed', 'pending')
    `;
    
    const params = [date];
    
    // Filtrar por técnico se informado
    if (technician_id) {
      query += ` AND technician_id = ?`;
      params.push(technician_id);
    }
    
    const [bookedSlots] = await db.promise().query(query, params);
    
    // Converter para Set para facilitar a verificação
    const bookedTimes = new Set(bookedSlots.map(slot => slot.schedule_time));
    
    // Gerar todos os slots possíveis
    const availableSlots = [];
    let currentSlot = moment(`${date} ${workDayStart}`);
    const endTime = moment(`${date} ${workDayEnd}`);
    const lunchStart = moment(`${date} ${lunchBreakStart}`);
    const lunchEnd = moment(`${date} ${lunchBreakEnd}`);
    
    while (currentSlot.isBefore(endTime)) {
      // Verificar se está no horário de almoço
      if (!currentSlot.isBetween(lunchStart, lunchEnd, null, '[)')) {
        const timeString = currentSlot.format('HH:mm:00');
        
        // Verificar se o horário já está reservado
        if (!bookedTimes.has(timeString)) {
          availableSlots.push({
            time: timeString,
            formatted_time: timeString.substring(0, 5)
          });
        }
      }
      
      // Avançar para o próximo slot
      currentSlot.add(slotDuration, 'minutes');
    }
    
    res.json(availableSlots);
  } catch (error) {
    console.error('Erro ao buscar slots disponíveis:', error);
    res.status(500).json({ error: 'Erro ao buscar slots disponíveis' });
  }
});

// Obter reminders pendentes (para o serviço de lembretes)
router.get('/reminders/pending', async (req, res) => {
  try {
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    
    const [pendingReminders] = await db.promise().query(
      `SELECT r.*, s.client_id, s.schedule_date, s.schedule_time, s.service_type,
       c.name AS client_name, c.phone AS client_phone
       FROM reminders r
       INNER JOIN schedules s ON r.schedule_id = s.id
       INNER JOIN clients c ON s.client_id = c.id
       WHERE r.status = 'pending'
       AND r.reminder_time <= ?
       AND s.status = 'confirmed'
       ORDER BY r.reminder_time ASC`,
      [now]
    );
    
    // Formatar datas para o padrão brasileiro
    const formattedReminders = pendingReminders.map(reminder => ({
      ...reminder,
      formatted_date: moment(reminder.schedule_date).format('DD/MM/YYYY'),
      formatted_time: reminder.schedule_time.substring(0, 5)
    }));
    
    res.json(formattedReminders);
  } catch (error) {
    console.error('Erro ao buscar lembretes pendentes:', error);
    res.status(500).json({ error: 'Erro ao buscar lembretes pendentes' });
  }
});

// Marcar reminder como enviado
router.patch('/reminders/:id/sent', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.promise().query(
      `UPDATE reminders SET 
       status = 'sent', 
       sent_at = NOW(),
       updated_at = NOW() 
       WHERE id = ?`,
      [id]
    );
    
    res.json({ message: 'Lembrete marcado como enviado' });
  } catch (error) {
    console.error('Erro ao atualizar status do lembrete:', error);
    res.status(500).json({ error: 'Erro ao atualizar status do lembrete' });
  }
});

// Obter agendamentos para o bot do WhatsApp
router.get('/whatsapp/client/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const formattedPhone = phone.replace(/\D/g, '');
    
    // Buscar cliente pelo telefone
    const [clients] = await db.promise().query(
      'SELECT id FROM clients WHERE phone LIKE ?',
      [`%${formattedPhone}%`]
    );
    
    if (clients.length === 0) {
      return res.json([]);
    }
    
    const clientId = clients[0].id;
    
    // Buscar agendamentos ativos do cliente
    const [schedules] = await db.promise().query(
      `SELECT id, schedule_date, schedule_time, service_type, status
       FROM schedules
       WHERE client_id = ?
       AND status IN ('confirmed', 'pending')
       AND schedule_date >= CURDATE()
       ORDER BY schedule_date ASC, schedule_time ASC`,
      [clientId]
    );
    
    // Formatar para o bot
    const formattedSchedules = schedules.map(schedule => ({
      id: schedule.id,
      date: moment(schedule.schedule_date).format('DD/MM/YYYY'),
      time: schedule.schedule_time.substring(0, 5),
      service: schedule.service_type,
      status: schedule.status === 'confirmed' ? 'Confirmado' : 'Pendente'
    }));
    
    res.json(formattedSchedules);
  } catch (error) {
    console.error('Erro ao buscar agendamentos para WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao buscar agendamentos' });
  }
});

// Criar agendamento via bot do WhatsApp
router.post('/whatsapp/create', async (req, res) => {
  try {
    const { 
      client_phone, 
      schedule_date, 
      schedule_time, 
      service_type
    } = req.body;
    
    if (!client_phone || !schedule_date || !schedule_time || !service_type) {
      return res.status(400).json({ 
        error: 'Telefone do cliente, data, hora e tipo de serviço são obrigatórios' 
      });
    }
    
    // Formatar telefone
    const formattedPhone = client_phone.replace(/\D/g, '');
    
    // Buscar cliente pelo telefone
    const [clients] = await db.promise().query(
      'SELECT id FROM clients WHERE phone LIKE ?',
      [`%${formattedPhone}%`]
    );
    
    if (clients.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    const clientId = clients[0].id;
    
    // Formatar data
    const formattedDate = moment(schedule_date, 'DD/MM/YYYY').format('YYYY-MM-DD');
    
    // Formatar hora
    let formattedTime = schedule_time;
    if (schedule_time.length === 5) {
      formattedTime = `${schedule_time}:00`;
    }
    
    // Verificar disponibilidade
    const [existingSchedules] = await db.promise().query(
      `SELECT id FROM schedules 
       WHERE schedule_date = ? 
       AND schedule_time = ? 
       AND status = 'confirmed'`,
      [formattedDate, formattedTime]
    );
    
    if (existingSchedules.length > 0) {
      return res.status(409).json({ 
        error: 'Horário não disponível' 
      });
    }
    
    // Criar o agendamento
    const [result] = await db.promise().query(
      `INSERT INTO schedules 
       (client_id, schedule_date, schedule_time, service_type, status, created_at) 
       VALUES (?, ?, ?, ?, 'confirmed', NOW())`,
      [clientId, formattedDate, formattedTime, service_type]
    );
    
    const newScheduleId = result.insertId;
    // Agendar o lembrete automático
    const reminderHours = 4; // Horas antes para enviar o lembrete
    const scheduleDateTime = moment(`${formattedDate} ${formattedTime}`);
    const reminderDateTime = scheduleDateTime.clone().subtract(reminderHours, 'hours');
    
    // Apenas agendar se o lembrete for no futuro
    if (reminderDateTime.isAfter(moment())) {
      await db.promise().query(
        `INSERT INTO reminders 
         (schedule_id, reminder_time, status, type, created_at) 
         VALUES (?, ?, ?, ?, NOW())`,
        [
          newScheduleId, 
          reminderDateTime.format('YYYY-MM-DD HH:mm:ss'), 
          'pending', 
          'schedule_confirmation'
        ]
      );
    }
    
    // Buscar o agendamento criado com os dados completos
    const [newSchedule] = await db.promise().query(
      `SELECT id, schedule_date, schedule_time, service_type, status
       FROM schedules
       WHERE id = ?`,
      [newScheduleId]
    );
    
    // Formatar para o bot
    const formattedSchedule = {
      id: newSchedule[0].id,
      date: moment(newSchedule[0].schedule_date).format('DD/MM/YYYY'),
      time: newSchedule[0].schedule_time.substring(0, 5),
      service: newSchedule[0].service_type,
      status: newSchedule[0].status === 'confirmed' ? 'Confirmado' : 'Pendente',
      message: 'Agendamento criado com sucesso'
    };
    
    res.status(201).json(formattedSchedule);
  } catch (error) {
    console.error('Erro ao criar agendamento via WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

// Confirmar agendamento via bot do WhatsApp (após receber lembrete)
router.post('/whatsapp/confirm/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmed } = req.body;
    
    // Verificar se o agendamento existe
    const [existingSchedule] = await db.promise().query(
      'SELECT id, status FROM schedules WHERE id = ?',
      [id]
    );
    
    if (existingSchedule.length === 0) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }
    
    if (confirmed === true) {
      // Confirmar o agendamento
      await db.promise().query(
        `UPDATE schedules SET 
         status = 'confirmed', 
         updated_at = NOW() 
         WHERE id = ?`,
        [id]
      );
      
      // Atualizar o lembrete como processado
      await db.promise().query(
        `UPDATE reminders SET 
         status = 'processed', 
         updated_at = NOW() 
         WHERE schedule_id = ? AND type = 'schedule_confirmation'`,
        [id]
      );
      
      res.json({ message: 'Agendamento confirmado com sucesso' });
    } else {
      // Cancelar o agendamento
      await db.promise().query(
        `UPDATE schedules SET 
         status = 'cancelled', 
         cancellation_reason = 'Cancelado pelo cliente via WhatsApp',
         updated_at = NOW() 
         WHERE id = ?`,
        [id]
      );
      
      // Cancelar o lembrete
      await db.promise().query(
        `UPDATE reminders SET 
         status = 'cancelled', 
         updated_at = NOW() 
         WHERE schedule_id = ? AND type = 'schedule_confirmation'`,
        [id]
      );
      
      res.json({ message: 'Agendamento cancelado com sucesso' });
    }
  } catch (error) {
    console.error('Erro ao confirmar agendamento via WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao processar confirmação' });
  }
});

// Obter datas com agendamentos (para o calendário)
router.get('/calendar/dates', verifyToken, async (req, res) => {
  try {
    const { month, year } = req.query;
    
    if (!month || !year) {
      return res.status(400).json({ error: 'Mês e ano são obrigatórios' });
    }
    
    // Criar data de início e fim do mês
    const startDate = moment(`${year}-${month}-01`).startOf('month').format('YYYY-MM-DD');
    const endDate = moment(`${year}-${month}-01`).endOf('month').format('YYYY-MM-DD');
    
    // Buscar dias com agendamentos
    const [scheduleDates] = await db.promise().query(
      `SELECT 
       schedule_date, 
       COUNT(*) as total,
       SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
       FROM schedules 
       WHERE schedule_date BETWEEN ? AND ?
       GROUP BY schedule_date
       ORDER BY schedule_date ASC`,
      [startDate, endDate]
    );
    
    // Formatar para o calendário
    const calendarData = scheduleDates.map(date => ({
      date: moment(date.schedule_date).format('YYYY-MM-DD'),
      total: date.total,
      confirmed: date.confirmed,
      pending: date.pending,
      cancelled: date.cancelled
    }));
    
    res.json(calendarData);
  } catch (error) {
    console.error('Erro ao buscar datas para o calendário:', error);
    res.status(500).json({ error: 'Erro ao buscar datas para o calendário' });
  }
});

// Obter estatísticas de agendamentos
router.get('/stats', verifyToken, async (req, res) => {
  try {
    // Estatísticas gerais
    const [totalStats] = await db.promise().query(
      `SELECT 
       COUNT(*) as total,
       SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
       FROM schedules`
    );
    
    // Agendamentos do mês atual
    const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
    const endOfMonth = moment().endOf('month').format('YYYY-MM-DD');
    
    const [monthlyStats] = await db.promise().query(
      `SELECT 
       COUNT(*) as total,
       SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
       FROM schedules
       WHERE schedule_date BETWEEN ? AND ?`,
      [startOfMonth, endOfMonth]
    );
    
    // Serviços mais agendados
    const [serviceStats] = await db.promise().query(
      `SELECT 
       service_type, 
       COUNT(*) as count
       FROM schedules
       WHERE status != 'cancelled'
       GROUP BY service_type
       ORDER BY count DESC
       LIMIT 5`
    );
    
    // Obter data do último e próximo agendamento
    const [nextSchedule] = await db.promise().query(
      `SELECT schedule_date, schedule_time
       FROM schedules
       WHERE status = 'confirmed'
       AND schedule_date >= CURDATE()
       ORDER BY schedule_date ASC, schedule_time ASC
       LIMIT 1`
    );
    
    const [lastSchedule] = await db.promise().query(
      `SELECT schedule_date, schedule_time
       FROM schedules
       WHERE status = 'confirmed'
       AND schedule_date < CURDATE()
       ORDER BY schedule_date DESC, schedule_time DESC
       LIMIT 1`
    );
    
    res.json({
      total: totalStats[0],
      monthly: monthlyStats[0],
      services: serviceStats,
      next: nextSchedule.length > 0 ? {
        date: moment(nextSchedule[0].schedule_date).format('DD/MM/YYYY'),
        time: nextSchedule[0].schedule_time.substring(0, 5)
      } : null,
      last: lastSchedule.length > 0 ? {
        date: moment(lastSchedule[0].schedule_date).format('DD/MM/YYYY'),
        time: lastSchedule[0].schedule_time.substring(0, 5)
      } : null
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas de agendamentos:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas de agendamentos' });
  }
});

module.exports = router;