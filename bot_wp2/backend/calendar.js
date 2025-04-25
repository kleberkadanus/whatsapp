/**
 * Módulo de Calendário e Agenda
 * 
 * Este módulo gerencia:
 * - Agendamentos de visitas técnicas
 * - Verificação de disponibilidade
 * - Lembretes automáticos
 * - Sincronização com agenda externa
 * - Estatísticas de agendamento
 */
const moment = require('moment');
const { google } = require('googleapis');
const db = require('./database');
const OAuth2 = google.auth.OAuth2;

let calendarService = null;
let calendarId = 'primary';

// Configurações padrão (serão substituídas pelas configurações do banco)
let config = {
  workingHours: {
    start: '08:00',
    end: '18:00',
    daysOff: [0, 6], // Domingo e Sábado
    lunchBreak: {
      start: '12:00',
      end: '13:00'
    }
  },
  slotDuration: 60, // minutos
  reminderHours: 4, // horas antes para enviar lembrete
  maxScheduleDays: 30 // dias máximos para agendar no futuro
};

// Inicializar configurações do banco de dados
const initConfig = async () => {
  try {
    const [settings] = await db.promise().query(
      'SELECT * FROM settings WHERE category = "scheduling"'
    );
    
    if (settings.length > 0) {
      settings.forEach(setting => {
        if (setting.name === 'working_hours' && setting.is_json) {
          config.workingHours = JSON.parse(setting.value);
        } else if (setting.name === 'scheduling_slot_duration') {
          config.slotDuration = parseInt(setting.value) || 60;
        } else if (setting.name === 'scheduling_reminder_hours') {
          config.reminderHours = parseInt(setting.value) || 4;
        } else if (setting.name === 'max_schedule_days') {
          config.maxScheduleDays = parseInt(setting.value) || 30;
        }
      });
    }
    
    console.log('Configurações de agenda carregadas com sucesso');
  } catch (error) {
    console.error('Erro ao carregar configurações de agenda:', error);
  }
};

// Obter disponibilidade para uma data específica
const getAvailableSlotsForDate = async (date, technicianId = null) => {
  try {
    // Validar o formato da data
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      throw new Error('Formato de data inválido. Use YYYY-MM-DD.');
    }
    
    // Verificar se é um dia não trabalhado (final de semana ou feriado)
    const dayOfWeek = moment(date).day();
    if (config.workingHours.daysOff.includes(dayOfWeek)) {
      return { 
        date,
        isWorkDay: false,
        availableSlots: [],
        message: 'Esta data não é um dia útil.'
      };
    }
    
    // Verificar feriados na tabela de feriados
    const [holidays] = await db.promise().query(
      'SELECT * FROM holidays WHERE holiday_date = ?',
      [date]
    );
    
    if (holidays.length > 0) {
      return { 
        date,
        isWorkDay: false,
        isHoliday: true,
        holidayName: holidays[0].description,
        availableSlots: [],
        message: `Feriado: ${holidays[0].description}`
      };
    }
    
    // Buscar agendamentos existentes para a data
    let query = `
      SELECT schedule_time 
      FROM schedules 
      WHERE schedule_date = ? 
      AND status IN ('confirmed', 'pending')
    `;
    
    const params = [date];
    
    // Filtrar por técnico se informado
    if (technicianId) {
      query += ` AND (technician_id = ? OR technician_id IS NULL)`;
      params.push(technicianId);
    }
    
    const [bookedSlots] = await db.promise().query(query, params);
    
    // Converter para Set para facilitar a verificação
    const bookedTimes = new Set(bookedSlots.map(slot => slot.schedule_time));
    
    // Gerar todos os slots possíveis
    const availableSlots = [];
    let currentSlot = moment(`${date} ${config.workingHours.start}`);
    const endTime = moment(`${date} ${config.workingHours.end}`);
    const lunchStart = moment(`${date} ${config.workingHours.lunchBreak.start}`);
    const lunchEnd = moment(`${date} ${config.workingHours.lunchBreak.end}`);
    
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
      currentSlot.add(config.slotDuration, 'minutes');
    }
    
    return {
      date,
      formatted_date: moment(date).format('DD/MM/YYYY'),
      isWorkDay: true,
      availableSlots,
      totalAvailable: availableSlots.length,
      message: availableSlots.length > 0 
        ? `${availableSlots.length} horário(s) disponível(is) para ${moment(date).format('DD/MM/YYYY')}`
        : `Não há horários disponíveis para ${moment(date).format('DD/MM/YYYY')}`
    };
  } catch (error) {
    console.error('Erro ao buscar slots disponíveis:', error);
    throw error;
  }
};

// Verificar disponibilidade para um período (semana / mês)
const getAvailabilityForPeriod = async (startDate, endDate, technicianId = null) => {
  try {
    const start = moment(startDate);
    const end = moment(endDate);
    
    // Limitar a busca ao máximo de dias configurado
    if (end.diff(start, 'days') > config.maxScheduleDays) {
      end.add(config.maxScheduleDays, 'days');
    }
    
    const availability = [];
    let currentDate = start.clone();
    
    while (currentDate.isSameOrBefore(end)) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      const slots = await getAvailableSlotsForDate(dateStr, technicianId);
      
      availability.push({
        date: dateStr,
        formatted_date: currentDate.format('DD/MM/YYYY'),
        day_of_week: currentDate.format('dddd'),
        day_of_week_short: currentDate.format('ddd'),
        has_availability: slots.availableSlots.length > 0,
        total_slots: slots.availableSlots.length,
        is_work_day: slots.isWorkDay
      });
      
      currentDate.add(1, 'day');
    }
    
    return {
      startDate,
      endDate,
      availability
    };
  } catch (error) {
    console.error('Erro ao buscar disponibilidade para o período:', error);
    throw error;
  }
};

// Criar um novo agendamento
const createSchedule = async (clientData, scheduleData) => {
  const connection = await db.promise().getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Validar cliente
    let clientId = null;
    
    if (clientData.id) {
      // Cliente já existente
      clientId = clientData.id;
      
      // Atualizar dados do cliente se necessário
      if (clientData.update) {
        await connection.query(
          `UPDATE clients SET 
           name = COALESCE(?, name), 
           email = COALESCE(?, email), 
           address = COALESCE(?, address),
           updated_at = NOW()
           WHERE id = ?`,
          [
            clientData.name || null, 
            clientData.email || null, 
            clientData.address || null, 
            clientId
          ]
        );
      }
    } else {
      // Novo cliente ou busca por telefone
      if (clientData.phone) {
        // Verificar se o cliente já existe pelo telefone
        const [existingClients] = await connection.query(
          'SELECT id FROM clients WHERE phone LIKE ?',
          [`%${clientData.phone.replace(/\D/g, '')}%`]
        );
        
        if (existingClients.length > 0) {
          clientId = existingClients[0].id;
          
          // Atualizar dados do cliente se necessário
          if (clientData.update) {
            await connection.query(
              `UPDATE clients SET 
               name = COALESCE(?, name), 
               email = COALESCE(?, email), 
               address = COALESCE(?, address),
               updated_at = NOW()
               WHERE id = ?`,
              [
                clientData.name || null, 
                clientData.email || null, 
                clientData.address || null, 
                clientId
              ]
            );
          }
        } else {
          // Criar novo cliente
          const [newClient] = await connection.query(
            `INSERT INTO clients 
             (name, phone, email, address, created_at) 
             VALUES (?, ?, ?, ?, NOW())`,
            [
              clientData.name || 'Cliente WhatsApp', 
              clientData.phone, 
              clientData.email || null, 
              clientData.address || null
            ]
          );
          
          clientId = newClient.insertId;
        }
      } else {
        throw new Error('Dados insuficientes para identificar ou criar cliente');
      }
    }
    
    // Formatar data e hora
    const formattedDate = moment(scheduleData.date).format('YYYY-MM-DD');
    let formattedTime = scheduleData.time;
    if (scheduleData.time.length === 5) {
      formattedTime = `${scheduleData.time}:00`;
    }
    
    // Verificar disponibilidade do horário
    const [existingSchedules] = await connection.query(
      `SELECT id FROM schedules 
       WHERE schedule_date = ? 
       AND schedule_time = ? 
       AND status IN ('confirmed', 'pending')
       AND (technician_id = ? OR technician_id IS NULL)`,
      [formattedDate, formattedTime, scheduleData.technician_id || null]
    );
    
    if (existingSchedules.length > 0) {
      await connection.rollback();
      throw new Error('Horário não disponível');
    }
    
    // Criar o agendamento
    const [newSchedule] = await connection.query(
      `INSERT INTO schedules 
       (client_id, technician_id, schedule_date, schedule_time, 
        service_type, notes, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        clientId, 
        scheduleData.technician_id || null, 
        formattedDate, 
        formattedTime, 
        scheduleData.service_type, 
        scheduleData.notes || null, 
        scheduleData.status || 'confirmed'
      ]
    );
    
    const scheduleId = newSchedule.insertId;
    
    // Criar lembrete automático
    const scheduleDateTime = moment(`${formattedDate} ${formattedTime}`);
    const reminderDateTime = scheduleDateTime.clone().subtract(config.reminderHours, 'hours');
    
    // Apenas agendar se o lembrete for no futuro
    if (reminderDateTime.isAfter(moment())) {
      await connection.query(
        `INSERT INTO reminders 
         (schedule_id, reminder_time, status, type, created_at) 
         VALUES (?, ?, ?, ?, NOW())`,
        [
          scheduleId, 
          reminderDateTime.format('YYYY-MM-DD HH:mm:ss'), 
          'pending', 
          'schedule_confirmation'
        ]
      );
    }
    
    await connection.commit();
    
    // Buscar o agendamento completo
    const [createdSchedule] = await db.promise().query(
      `SELECT s.*, c.name AS client_name, c.phone AS client_phone,
       u.name AS technician_name
       FROM schedules s
       LEFT JOIN clients c ON s.client_id = c.id
       LEFT JOIN users u ON s.technician_id = u.id
       WHERE s.id = ?`,
      [scheduleId]
    );
    
    // Enviar mensagem de confirmação via WhatsApp
    if (createdSchedule.length > 0 && clientData.phone) {
      try {
        // Obter mensagem personalizada do banco de dados
        const confirmationMessages = await getSystemMessage('scheduling', 'Agendamento confirmado');
        
        if (confirmationMessages.length > 0) {
          let message = confirmationMessages[0].content;
          
          // Substituir variáveis
          message = message
            .replace('{cliente_nome}', clientData.name || 'Cliente')
            .replace('{agenda_data}', moment(formattedDate).format('DD/MM/YYYY'))
            .replace('{agenda_hora}', formattedTime.substring(0, 5))
            .replace('{tecnico_nome}', createdSchedule[0].technician_name || 'Um técnico');
          
          await sendWhatsAppMessage(clientData.phone, message);
        }
      } catch (msgError) {
        console.error('Erro ao enviar mensagem de confirmação:', msgError);
        // Não interromper o fluxo se a mensagem falhar
      }
    }
    
    return {
      id: scheduleId,
      client_id: clientId,
      client_name: createdSchedule[0].client_name,
      schedule_date: formattedDate,
      formatted_date: moment(formattedDate).format('DD/MM/YYYY'),
      schedule_time: formattedTime,
      formatted_time: formattedTime.substring(0, 5),
      service_type: scheduleData.service_type,
      status: scheduleData.status || 'confirmed',
      technician_id: scheduleData.technician_id || null,
      technician_name: createdSchedule[0].technician_name || null,
      message: 'Agendamento criado com sucesso'
    };
  } catch (error) {
    await connection.rollback();
    console.error('Erro ao criar agendamento:', error);
    throw error;
  } finally {
    connection.release();
  }
};

// Atualizar status de um agendamento
const updateScheduleStatus = async (scheduleId, status, reason = null) => {
  try {
    // Verificar se o agendamento existe
    const [schedules] = await db.promise().query(
      `SELECT s.*, c.phone as client_phone, c.name as client_name
       FROM schedules s
       LEFT JOIN clients c ON s.client_id = c.id
       WHERE s.id = ?`,
      [scheduleId]
    );
    
    if (schedules.length === 0) {
      throw new Error('Agendamento não encontrado');
    }
    
    // Atualizar o status
    await db.promise().query(
      `UPDATE schedules SET 
       status = ?,
       cancellation_reason = ?,
       updated_at = NOW()
       WHERE id = ?`,
      [status, status === 'cancelled' ? reason : null, scheduleId]
    );
    
    // Se cancelado, cancelar também os lembretes
    if (status === 'cancelled') {
      await db.promise().query(
        'UPDATE reminders SET status = "cancelled" WHERE schedule_id = ?',
        [scheduleId]
      );
      
      // Enviar mensagem de cancelamento via WhatsApp
      if (schedules[0].client_phone) {
        try {
          // Obter mensagem personalizada do banco de dados
          const cancelMessages = await getSystemMessage('scheduling', 'Agendamento cancelado');
          
          if (cancelMessages.length > 0) {
            let message = cancelMessages[0].content;
            
            // Substituir variáveis
            message = message
              .replace('{cliente_nome}', schedules[0].client_name || 'Cliente')
              .replace('{agenda_data}', moment(schedules[0].schedule_date).format('DD/MM/YYYY'))
              .replace('{agenda_hora}', schedules[0].schedule_time.substring(0, 5));
            
            await sendWhatsAppMessage(schedules[0].client_phone, message);
          }
        } catch (msgError) {
          console.error('Erro ao enviar mensagem de cancelamento:', msgError);
          // Não interromper o fluxo se a mensagem falhar
        }
      }
    }
    
    return {
      id: scheduleId,
      status,
      message: status === 'cancelled' 
        ? 'Agendamento cancelado com sucesso' 
        : 'Status do agendamento atualizado com sucesso'
    };
  } catch (error) {
    console.error('Erro ao atualizar status do agendamento:', error);
    throw error;
  }
};

// Processar lembretes pendentes
const processReminders = async () => {
  try {
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    
    // Buscar lembretes pendentes
    const [pendingReminders] = await db.promise().query(
      `SELECT r.*, s.client_id, s.schedule_date, s.schedule_time, s.service_type,
       c.name AS client_name, c.phone AS client_phone
       FROM reminders r
       INNER JOIN schedules s ON r.schedule_id = s.id
       INNER JOIN clients c ON s.client_id = c.id
       WHERE r.status = 'pending'
       AND r.reminder_time <= ?
       AND s.status = 'confirmed'
       ORDER BY r.reminder_time ASC
       LIMIT 10`,
      [now]
    );
    
    console.log(`Processando ${pendingReminders.length} lembretes pendentes`);
    
    for (const reminder of pendingReminders) {
      if (reminder.type === 'schedule_confirmation' && reminder.client_phone) {
        try {
          // Obter mensagem personalizada do banco de dados
          const reminderMessages = await getSystemMessage('scheduling', 'Lembrete de agendamento');
          
          if (reminderMessages.length > 0) {
            let message = reminderMessages[0].content;
            
            // Substituir variáveis
            message = message
              .replace('{cliente_nome}', reminder.client_name || 'Cliente')
              .replace('{agenda_data}', moment(reminder.schedule_date).format('DD/MM/YYYY'))
              .replace('{agenda_hora}', reminder.schedule_time.substring(0, 5));
            
            // Enviar mensagem com botões de confirmação
            await sendWhatsAppMessage(
              reminder.client_phone, 
              message,
              {
                type: 'confirmation',
                scheduleId: reminder.schedule_id,
                options: [
                  { id: 'confirm', text: 'Confirmar' },
                  { id: 'cancel', text: 'Cancelar' }
                ]
              }
            );
            
            // Atualizar status do lembrete
            await db.promise().query(
              `UPDATE reminders SET 
               status = 'sent', 
               sent_at = NOW(),
               updated_at = NOW() 
               WHERE id = ?`,
              [reminder.id]
            );
            
            console.log(`Lembrete enviado com sucesso para ${reminder.client_phone}`);
          }
        } catch (error) {
          console.error(`Erro ao processar lembrete ${reminder.id}:`, error);
          
          // Marcar como erro, mas tentar novamente mais tarde
          await db.promise().query(
            `UPDATE reminders SET 
             status = 'error', 
             updated_at = NOW() 
             WHERE id = ?`,
            [reminder.id]
          );
        }
      }
    }
    
    return {
      processed: pendingReminders.length,
      success: true
    };
  } catch (error) {
    console.error('Erro ao processar lembretes:', error);
    return {
      processed: 0,
      success: false,
      error: error.message
    };
  }
};

// Obter agendamentos do cliente
const getClientSchedules = async (clientPhone, status = 'all') => {
  try {
    // Formatar telefone
    const formattedPhone = clientPhone.replace(/\D/g, '');
    
    // Buscar cliente pelo telefone
    const [clients] = await db.promise().query(
      'SELECT id FROM clients WHERE phone LIKE ?',
      [`%${formattedPhone}%`]
    );
    
    if (clients.length === 0) {
      return [];
    }
    
    const clientId = clients[0].id;
    
    // Construir query com base no status solicitado
    let query = `
      SELECT s.id, s.schedule_date, s.schedule_time, s.service_type, s.status,
      u.name AS technician_name
      FROM schedules s
      LEFT JOIN users u ON s.technician_id = u.id
      WHERE s.client_id = ?
    `;
    
    const params = [clientId];
    
    // Filtrar por status se não for 'all'
    if (status !== 'all') {
      if (status === 'active') {
        query += ' AND s.status IN ("confirmed", "pending")';
      } else {
        query += ' AND s.status = ?';
        params.push(status);
      }
    }
    
    // Ordenar por data/hora
    query += ' ORDER BY s.schedule_date DESC, s.schedule_time DESC';
    
    // Executar a query
    const [schedules] = await db.promise().query(query, params);
    
    // Formatar datas
    return schedules.map(schedule => ({
      id: schedule.id,
      date: moment(schedule.schedule_date).format('DD/MM/YYYY'),
      time: schedule.schedule_time.substring(0, 5),
      service: schedule.service_type,
      status: schedule.status,
      technician: schedule.technician_name,
      isPast: moment(schedule.schedule_date).isBefore(moment().startOf('day'))
    }));
  } catch (error) {
    console.error('Erro ao buscar agendamentos do cliente:', error);
    throw error;
  }
};

// Obter estatísticas de agendamento
const getScheduleStats = async (period = 'month') => {
  try {
    let startDate, endDate;
    
    // Definir período de análise
    if (period === 'week') {
      startDate = moment().subtract(7, 'days').format('YYYY-MM-DD');
      endDate = moment().format('YYYY-MM-DD');
    } else if (period === 'month') {
      startDate = moment().subtract(30, 'days').format('YYYY-MM-DD');
      endDate = moment().format('YYYY-MM-DD');
    } else if (period === 'year') {
      startDate = moment().subtract(365, 'days').format('YYYY-MM-DD');
      endDate = moment().format('YYYY-MM-DD');
    } else {
      startDate = period.split(',')[0];
      endDate = period.split(',')[1] || moment().format('YYYY-MM-DD');
    }
    
    // Estatísticas gerais do período
    const [totals] = await db.promise().query(
      `SELECT 
       COUNT(*) as total,
       SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
       FROM schedules
       WHERE schedule_date BETWEEN ? AND ?`,
      [startDate, endDate]
    );
    
    // Estatísticas por serviço
    const [services] = await db.promise().query(
      `SELECT 
       service_type, 
       COUNT(*) as count
       FROM schedules
       WHERE schedule_date BETWEEN ? AND ?
       AND status != 'cancelled'
       GROUP BY service_type
       ORDER BY count DESC`,
      [startDate, endDate]
    );
    
    // Estatísticas por dia da semana
    const [dayOfWeek] = await db.promise().query(
      `SELECT 
       DAYOFWEEK(schedule_date) as day_number,
       COUNT(*) as count
       FROM schedules
       WHERE schedule_date BETWEEN ? AND ?
       AND status != 'cancelled'
       GROUP BY day_number
       ORDER BY day_number`,
      [startDate, endDate]
    );
    
    // Formatar estatísticas por dia da semana
    const daysOfWeek = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const formattedDayStats = Array(7).fill(0);
    
    dayOfWeek.forEach(day => {
      formattedDayStats[day.day_number - 1] = day.count;
    });
    
    const dayStats = daysOfWeek.map((name, index) => ({
      day: name,
      count: formattedDayStats[index]
    }));
    
    return {
      period: {
        start: startDate,
        end: endDate,
        formatted_start: moment(startDate).format('DD/MM/YYYY'),
        formatted_end: moment(endDate).format('DD/MM/YYYY')
      },
      totals: totals[0],
      services,
      days: dayStats,
      completion_rate: totals[0].total > 0 
        ? Math.round((totals[0].completed / (totals[0].total - totals[0].cancelled)) * 100) 
        : 0,
      cancellation_rate: totals[0].total > 0 
        ? Math.round((totals[0].cancelled / totals[0].total) * 100) 
        : 0
    };
  } catch (error) {
    console.error('Erro ao obter estatísticas de agendamento:', error);
    throw error;
  }
};
async function initCalendarAuth() {
    try {
      // 1) busca credenciais no banco
      const [ rows ] = await db.promise().query(
        `SELECT client_id, client_secret, refresh_token, calendar_id
         FROM api_configs
         WHERE api_name = ?
         LIMIT 1`,
        ['google_calendar']
      );
      if (!rows.length) {
        throw new Error('Nenhuma configuração para google_calendar em api_configs');
      }
      const { client_id, client_secret, refresh_token, calendar_id: dbCalId } = rows[0];
  
      // 2) configura OAuth2
      const oAuth2Client = new OAuth2(client_id, client_secret);
      if (!refresh_token) {
        console.warn('⚠️ Não há refresh_token; gere e salve na tabela api_configs.');
      } else {
        oAuth2Client.setCredentials({ refresh_token });
        await oAuth2Client.getAccessToken();
      }
  
      // 3) define o ID do calendário
      calendarId = dbCalId?.trim() || 'primary';
  
      // 4) instancia o serviço
      calendarService = google.calendar({ version: 'v3', auth: oAuth2Client });
      console.log('✅ Google Calendar autenticado. Calendar ID:', calendarId);
    } catch (err) {
      console.error('❌ Erro ao carregar configurações de agenda:', err);
    }
  }
  
  async function createCalendarEvent({ summary, description, startDateTime, endDateTime, attendees = [] }) {
    if (!calendarService) {
      throw new Error('Calendar não inicializado. Chame initCalendarAuth() antes.');
    }
    const event = { summary, description, start: { dateTime: startDateTime }, end: { dateTime: endDateTime }, attendees };
    const res = await calendarService.events.insert({ calendarId, resource: event });
    return res.data;
  }
// Inicializar o módulo
initConfig();

module.exports = {
  initCalendarAuth,
  createCalendarEvent,
  getAvailableSlotsForDate,
  getAvailabilityForPeriod,
  createSchedule,
  updateScheduleStatus,
  processReminders,
  getClientSchedules,
  getScheduleStats
};