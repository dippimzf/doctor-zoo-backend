const { Pool } = require('pg');
require('dotenv').config();

// Настройка подключения к PostgreSQL
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

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