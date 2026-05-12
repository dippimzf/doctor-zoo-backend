const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const { query } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_key_123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ============= АВТОРИЗАЦИЯ =============

app.post('/api/register', async (req, res) => {
    try {
        const { name, phone, gender, password } = req.body;
        
        const existing = await query('SELECT * FROM users WHERE phone = $1', [phone]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Телефон уже зарегистрирован' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const result = await query(
            'INSERT INTO users (name, phone, gender, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, phone, role',
            [name, phone, gender, hashedPassword, 'client']
        );
        
        req.session.user = result.rows[0];
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка регистрации' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        
        const result = await query('SELECT * FROM users WHERE phone = $1', [phone]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Неверный телефон или пароль' });
        }
        
        const user = result.rows[0];
        const isValid = await bcrypt.compare(password, user.password_hash);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Неверный телефон или пароль' });
        }
        
        const { password_hash, ...userWithoutPassword } = user;
        req.session.user = userWithoutPassword;
        res.json({ success: true, user: userWithoutPassword });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка входа' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/me', (req, res) => {
    if (req.session.user) {
        res.json({ user: req.session.user });
    } else {
        res.json({ user: null });
    }
});

// ============= УСЛУГИ =============

app.get('/api/services', async (req, res) => {
    try {
        const result = await query('SELECT * FROM services ORDER BY id');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка получения услуг' });
    }
});

app.post('/api/services', async (req, res) => {
    try {
        if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'vet')) {
            return res.status(403).json({ error: 'Нет прав' });
        }
        
        const { title, duration } = req.body;
        const result = await query(
            'INSERT INTO services (title, duration) VALUES ($1, $2) RETURNING *',
            [title, duration]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка добавления услуги' });
    }
});

app.put('/api/services/:id', async (req, res) => {
    try {
        if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'vet')) {
            return res.status(403).json({ error: 'Нет прав' });
        }
        
        const { duration } = req.body;
        const serviceId = req.params.id;
        
        await query('UPDATE services SET duration = $1 WHERE id = $2', [duration, serviceId]);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка обновления услуги' });
    }
});

app.delete('/api/services/:id', async (req, res) => {
    try {
        if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'vet')) {
            return res.status(403).json({ error: 'Нет прав' });
        }
        
        await query('DELETE FROM services WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка удаления услуги' });
    }
});

// ============= ЗАПИСИ =============

app.get('/api/appointments', async (req, res) => {
    try {
        const user = req.session.user;
        let result;
        
        if (!user) {
            return res.json([]);
        }
        
        if (user.role === 'admin' || user.role === 'vet') {
            result = await query(`
                SELECT a.*, s.title as service_name, s.duration, u.name as user_name
                FROM appointments a
                LEFT JOIN services s ON a.service_id = s.id
                LEFT JOIN users u ON a.user_id = u.id
                ORDER BY a.appointment_date, a.appointment_time
            `);
        } else {
            result = await query(`
                SELECT a.*, s.title as service_name, s.duration
                FROM appointments a
                LEFT JOIN services s ON a.service_id = s.id
                WHERE a.user_id = $1
                ORDER BY a.appointment_date, a.appointment_time
            `, [user.id]);
        }
        
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения записей' });
    }
});

app.post('/api/appointments', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Необходима авторизация' });
        }
        
        const { petType, serviceId, date, time, symptoms } = req.body;
        const user = req.session.user;
        
        const result = await query(
            `INSERT INTO appointments (user_id, pet_type, service_id, appointment_date, appointment_time, symptoms) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [user.id, petType, serviceId, date, time, symptoms]
        );
        
        await query(
            `INSERT INTO notifications (user_id, title, message, type) 
             VALUES ($1, $2, $3, $4)`,
            [user.id, 'Запись создана', `Ваша запись на ${date} в ${time} успешно создана`, 'success']
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка создания записи' });
    }
});

app.put('/api/appointments/:id/reschedule', async (req, res) => {
    try {
        if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'vet')) {
            return res.status(403).json({ error: 'Нет прав' });
        }
        
        const { date, time } = req.body;
        const appointmentId = req.params.id;
        
        const appointment = await query('SELECT user_id, service_id FROM appointments WHERE id = $1', [appointmentId]);
        if (appointment.rows.length === 0) {
            return res.status(404).json({ error: 'Запись не найдена' });
        }
        
        const service = await query('SELECT duration FROM services WHERE id = $1', [appointment.rows[0].service_id]);
        const duration = service.rows[0].duration;
        
        const conflict = await query(
            `SELECT id FROM appointments 
             WHERE appointment_date = $1 AND appointment_time = $2 AND id != $3`,
            [date, time, appointmentId]
        );
        
        if (conflict.rows.length > 0) {
            return res.status(409).json({ error: 'Это время уже занято' });
        }
        
        await query(
            'UPDATE appointments SET appointment_date = $1, appointment_time = $2 WHERE id = $3',
            [date, time, appointmentId]
        );
        
        await query(
            `INSERT INTO notifications (user_id, title, message, type) 
             VALUES ($1, $2, $3, $4)`,
            [appointment.rows[0].user_id, 'Запись перенесена', `Ваша запись перенесена на ${date} в ${time}`, 'warning']
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка переноса записи' });
    }
});

app.delete('/api/appointments/:id', async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.status(401).json({ error: 'Необходима авторизация' });
        }
        
        let queryCheck;
        if (user.role === 'admin' || user.role === 'vet') {
            queryCheck = await query('SELECT user_id FROM appointments WHERE id = $1', [req.params.id]);
        } else {
            queryCheck = await query('SELECT user_id FROM appointments WHERE id = $1 AND user_id = $2', [req.params.id, user.id]);
        }
        
        if (queryCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Запись не найдена' });
        }
        
        const appointment = queryCheck.rows[0];
        
        await query('DELETE FROM appointments WHERE id = $1', [req.params.id]);
        
        await query(
            `INSERT INTO notifications (user_id, title, message, type) 
             VALUES ($1, $2, $3, $4)`,
            [appointment.user_id, 'Запись отменена', 'Ваша запись была отменена', 'danger']
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка отмены записи' });
    }
});

// ============= УВЕДОМЛЕНИЯ =============

app.get('/api/notifications', async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.json([]);
        }
        
        const result = await query(
            'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
            [user.id]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        await query('UPDATE notifications SET is_read = true WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// ============= ОТЗЫВЫ =============

app.get('/api/reviews', async (req, res) => {
    try {
        const result = await query(`
            SELECT r.*, u.name as user_name 
            FROM reviews r
            LEFT JOIN users u ON r.user_id = u.id
            ORDER BY r.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

app.post('/api/reviews', async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.status(401).json({ error: 'Только авторизованные пользователи могут оставлять отзывы' });
        }
        
        const { text, rating } = req.body;
        const result = await query(
            'INSERT INTO reviews (user_id, text, rating, author_name) VALUES ($1, $2, $3, $4) RETURNING *',
            [user.id, text, rating, user.name]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка' });
    }
});

// ============= СВОБОДНЫЕ СЛОТЫ =============

app.get('/api/available-slots', async (req, res) => {
    try {
        const { date, serviceId } = req.query;
        
        const service = await query('SELECT duration FROM services WHERE id = $1', [serviceId]);
        if (service.rows.length === 0) {
            return res.json([]);
        }
        
        const booked = await query(
            `SELECT appointment_time 
             FROM appointments 
             WHERE appointment_date = $1`,
            [date]
        );
        
        const bookedTimes = booked.rows.map(row => row.appointment_time.substring(0, 5));
        
        const slots = [];
        const startHour = 9;
        const endHour = 18;
        
        for (let hour = startHour; hour < endHour; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                if (!bookedTimes.includes(time)) {
                    slots.push(time);
                }
            }
        }
        
        res.json(slots);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка' });
    }
});

// ============= ЗАПУСК СЕРВЕРА =============

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
    console.log(`Статические файлы из папки public`);
});

async function initDatabase() {
    try {
        const servicesCount = await query('SELECT COUNT(*) FROM services');
        if (parseInt(servicesCount.rows[0].count) === 0) {
            const defaultServices = [
                { title: 'Терапия', duration: 30, description: 'Первичный осмотр, диагностика и назначение лечения.' },
                { title: 'Вакцинация', duration: 20, description: 'Комплексные прививки для собак и кошек.' },
                { title: 'Стоматология', duration: 40, description: 'Чистка зубов, удаление, лечение.' },
                { title: 'Хирургия', duration: 60, description: 'Плановые и экстренные операции.' },
                { title: 'УЗИ', duration: 30, description: 'Ультразвуковая диагностика.' },
                { title: 'Груминг', duration: 60, description: 'Стрижка и уход за шерстью.' }
            ];
            
            for (const service of defaultServices) {
                await query(
                    'INSERT INTO services (title, duration, description) VALUES ($1, $2, $3)',
                    [service.title, service.duration, service.description]
                );
            }
            console.log('Добавлены начальные услуги');
        }
        
        const adminExists = await query('SELECT * FROM users WHERE phone = $1', ['89086487833']);
        if (adminExists.rows.length === 0) {
            const hashedPass = await bcrypt.hash('dana2004', 10);
            await query(
                'INSERT INTO users (name, phone, password_hash, role) VALUES ($1, $2, $3, $4)',
                ['Администратор', '89086487833', hashedPass, 'admin']
            );
            console.log('Добавлен админ');
        }
        
        const vetExists = await query('SELECT * FROM users WHERE phone = $1', ['89086628277']);
        if (vetExists.rows.length === 0) {
            const hashedPass = await bcrypt.hash('nata1983', 10);
            await query(
                'INSERT INTO users (name, phone, password_hash, role) VALUES ($1, $2, $3, $4)',
                ['Агеева Н.Н.', '89086628277', hashedPass, 'vet']
            );
            console.log('Добавлен врач');
        }
        
        const reviewsCount = await query('SELECT COUNT(*) FROM reviews');
        if (parseInt(reviewsCount.rows[0].count) === 0) {
            const defaultReviews = [
                { text: 'Хорошая клиника, чисто, уютно. Цены адекватные.', rating: 5, author: 'Игорь Петров' },
                { text: 'Регулярно вожу сюда собаку на груминг. Персонал приветливый.', rating: 5, author: 'Мария В.' },
                { text: 'Спасибо большое за качественную помощь!', rating: 5, author: 'Александр Бельский' },
                { text: 'Огромное спасибо вам! Настоящие профессионалы!', rating: 5, author: 'Александра Новопашина' }
            ];
            
            for (const review of defaultReviews) {
                await query(
                    'INSERT INTO reviews (text, rating, author_name) VALUES ($1, $2, $3)',
                    [review.text, review.rating, review.author]
                );
            }
            console.log('Добавлены начальные отзывы');
        }
        
        console.log('База данных инициализирована');
    } catch (error) {
        console.error('Ошибка инициализации:', error);
    }
}

initDatabase();