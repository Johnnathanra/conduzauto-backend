const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Rotas
app.use('/api/auth', require('./routes/auth'));

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({ message: '✅ Backend ConduzAuto está rodando!' });
});

module.exports = app;
