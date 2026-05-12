const { Pool } = require('pg');
require('dotenv').config();

// Используем DATABASE_URL (для Render) или отдельные переменные (для локальной разработки)
let poolConfig;

if (process.env.DATABASE_URL) {
    // Для Render - используем полную строку подключения
    poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false  // ОБЯЗАТЕЛЬНО для Render!
        }
    };
} else {
    // Для локальной разработки (ваш компьютер)
    poolConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'vet_clinic',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
    };
}

const pool = new Pool(poolConfig);

// Функция для выполнения запросов
async function query(sql, params = []) {
    try {
        const result = await pool.query(sql, params);
        return result;
    } catch (error) {
        console.error('Ошибка БД:', error);
        throw error;
    }
}

module.exports = { pool, query };