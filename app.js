
require('dotenv').config()
const express = require('express');
const userRoutes = require('./routes/userRoutes');
const mongoose = require('./models/DB');
const Product = require('./models/Product');
const session = require("express-session");
const app = express();
app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));



app.use(session({
  secret: "secret123",
  resave: false,
  saveUninitialized: true
}));


app.use((req, res, next) => {

  res.locals.cartCount = req.session.cart
    ? req.session.cart.reduce((total, item) => total + item.qty, 0)
    : 0;

  next();
});



app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

app.use('/', userRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});