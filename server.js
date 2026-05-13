const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const { query } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Настройки
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_key_123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ============= СОЗДАНИЕ ТАБЛИЦ =============
async function createTables() {
    console.log('Проверка/создание таблиц...');
    
    await query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            phone VARCHAR(20) UNIQUE NOT NULL,
            gender VARCHAR(10),
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) DEFAULT 'client',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ Таблица users');

    await query(`
        CREATE TABLE IF NOT EXISTS services (
            id SERIAL PRIMARY KEY,
            title VARCHAR(100) NOT NULL,
            duration INT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ Таблица services');

    await query(`
        CREATE TABLE IF NOT EXISTS appointments (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            pet_type VARCHAR(50) NOT NULL,
            service_id INT REFERENCES services(id),
            appointment_date DATE NOT NULL,
            appointment_time TIME NOT NULL,
            symptoms TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ Таблица appointments');

    await query(`
        CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(200) NOT NULL,
            message TEXT,
            type VARCHAR(20) DEFAULT 'info',
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ Таблица notifications');

    await query(`
        CREATE TABLE IF NOT EXISTS reviews (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE SET NULL,
            text TEXT NOT NULL,
            rating INT CHECK (rating >= 1 AND rating <= 5),
            author_name VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ Таблица reviews');

    console.log('Все таблицы созданы/проверены');
}

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
        await query('UPDATE services SET duration = $1 WHERE id = $2', [duration, req.params.id]);
        res.json({ success: true });
    } catch (error) {
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
        if (!user) return res.json([]);
        
        let result;
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
        
        const appointment = await query('SELECT user_id FROM appointments WHERE id = $1', [appointmentId]);
        if (appointment.rows.length === 0) {
            return res.status(404).json({ error: 'Запись не найдена' });
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
        if (!user) return res.status(401).json({ error: 'Необходима авторизация' });
        
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
        if (!user) return res.json([]);
        
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
        console.error('Ошибка получения отзывов:', error);
        res.status(500).json({ error: 'Ошибка получения отзывов' });
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
        console.error('Ошибка добавления отзыва:', error);
        res.status(500).json({ error: 'Ошибка добавления отзыва' });
    }
});

// ============= СВОБОДНЫЕ СЛОТЫ =============

app.get('/api/available-slots', async (req, res) => {
    try {
        const { date, serviceId } = req.query;
        
        const booked = await query(
            `SELECT appointment_time FROM appointments WHERE appointment_date = $1`,
            [date]
        );
        
        const bookedTimes = booked.rows.map(row => row.appointment_time.substring(0, 5));
        
        const slots = [];
        for (let hour = 9; hour < 18; hour++) {
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
        res.status(500).json({ error: 'Ошибка получения свободных слотов' });
    }
});

// ============= ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ =============

async function initDatabase() {
    try {
        await createTables();
        
        // Добавляем услуги
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
                await query('INSERT INTO services (title, duration, description) VALUES ($1, $2, $3)',
                    [service.title, service.duration, service.description]);
            }
            console.log('✅ Добавлены услуги');
        }
        
        // Добавляем админа
        const adminExists = await query('SELECT * FROM users WHERE phone = $1', ['89086487833']);
        if (adminExists.rows.length === 0) {
            const hashedPass = await bcrypt.hash('dana2004', 10);
            await query('INSERT INTO users (name, phone, password_hash, role) VALUES ($1, $2, $3, $4)',
                ['Администратор', '89086487833', hashedPass, 'admin']);
            console.log('✅ Добавлен администратор');
        }
        
        // Добавляем врача
        const vetExists = await query('SELECT * FROM users WHERE phone = $1', ['89086628277']);
        if (vetExists.rows.length === 0) {
            const hashedPass = await bcrypt.hash('nata1983', 10);
            await query('INSERT INTO users (name, phone, password_hash, role) VALUES ($1, $2, $3, $4)',
                ['Агеева Н.Н.', '89086628277', hashedPass, 'vet']);
            console.log('✅ Добавлен врач');
        }
        
        // ========== ПОЛНЫЕ ОТЗЫВЫ (8 штук) ==========
        const reviewsCount = await query('SELECT COUNT(*) FROM reviews');
        if (parseInt(reviewsCount.rows[0].count) === 0) {
	const fullReviews = [
    		{ text: 'Хорошая клиника, чисто, уютно. Цены адекватные. Единственное - пришлось немного подождать в очереди, но результат того стоил.', rating: 5, author: 'Игорь Петров' },
   	        { text: 'Регулярно водим сюда собаку на груминг и вакцинацию. Персонал всегда приветливый, собака идет без страха.', rating: 5, author: 'Мария В.' },
    		{ text: 'Спасибо большое за своевременную качественную помощь. Работа слаженная и профессиональная. Кошечке стало легче.', rating: 5, author: 'Александр Бельский' },
    		{ text: 'Огромное спасибо вам❤️ Настоящие профессионалы, всё качественно, аккуратно, делают с заботой и любовью.', rating: 5, author: 'Александра Новопашина' },
    		{ text: 'Выражаю благодарность вет.врачам данной клиники! Профессионально и быстро отреагировали на проблему. Спасли нам собаку.', rating: 5, author: 'Дарья Тисленко' },
   		{ text: 'Наталья отличный ветеринар! Второй раз помогла нашей кошечке от возрастных проблем с зубами, спасибо вам огромное 💐', rating: 5, author: 'Наталья Аверьянова' },
    		{ text: 'Приятная доктор, видно что дело свое знает. Спасла нашу собачку от клеща. Спасибо большое', rating: 5, author: 'Kate Mil' },
    		{ text: 'Благодарю Наталью Николаевну и Андрея Сергеевича за оказанную помощь моим домашним животным. Всегда в наличии есть необходимые препараты.', rating: 5, author: 'Анастасия Дмитриева' }
		];
		console.log('🔄 Обновление отзывов...');
		await query('DELETE FROM reviews');
		for (const review of fullReviews) {
   			await query('INSERT INTO reviews (text, rating, author_name) VALUES ($1, $2, $3)',
        			[review.text, review.rating, review.author]);
		}
		console.log('✅ Добавлены ПОЛНЫЕ отзывы (8 штук)');
        }
        
        console.log('🎉 База данных полностью инициализирована!');
    } catch (error) {
        console.error('❌ Ошибка инициализации БД:', error);
    }
}

// ============= ЗАПУСК =============

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📁 Статические файлы из папки public`);
});

initDatabase();