const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Rota raiz da API
app.get('/api', (req, res) => {
  res.json({ message: 'API ConduzAuto funcionando!' });
});

// ✅ Rotas (removida a duplicação)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/instructor', require('./routes/instructor')); // ✅ Contém /accept-invitation

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({ message: '✅ Backend ConduzAuto está rodando!' });
});

// Tratamento de erros 404
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Rota não encontrada',
    path: req.path,
    method: req.method
  });
});

// Tratamento global de erros
app.use((err, req, res, next) => {
  console.error('❌ [ERRO GLOBAL]', err);
  res.status(err.status || 500).json({ 
    error: err.message || 'Erro interno do servidor'
  });
});

module.exports = app;
