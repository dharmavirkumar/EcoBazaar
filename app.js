
require('dotenv').config()
const express = require('express');
const userRoutes = require('./routes/userRoutes');
const mongoose = require('./models/DB');
const Product = require('./models/Product');
const app = express();

app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use('/', userRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});