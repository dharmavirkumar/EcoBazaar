const Product = require('../models/Product');
const express = require('express');
const { mongo } = require('mongoose');
const router = express.Router();
const multer = require('multer');
const path = require('path');
mongoose = require('mongoose');
const Order = require('../models/Order');
// Multer configuration for file uploads
const storage = multer.diskStorage({
   destination: function (req, file, cb) {
      cb(null, 'public/uploads/')
   },
   filename: function (req, file, cb) {
      cb(null, Date.now() + '-' + file.originalname)
   }

})

const upload = multer({ storage: storage });


// Electronics page
router.get("/electronics", async (req,res)=>{

const products = await Product.find({category:"electronics"});

res.render("Electronics",{products});

});

router.get("/add-product",(req,res)=>{

res.render("Products");

});

router.post('/add-product', upload.single("image"),(req,res)=>{

   const{name,price,description,category} = req.body;
   const image = req.file ? req.file.filename : "";
   const newProduct = new Product({
      name,
      price,
      description,
      category,
      image
   });

   newProduct.save()
   .then(()=> res.redirect('/'))
   .catch(err => console.log(err));
})

router.get('/men',async (req,res)=>{
   const products = await Product.find({category:'fashion'})
   res.render('men',{products})
})



router.get("/product/:id", async (req, res) => {

  const id = req.params.id;

  // Check valid ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.send("Invalid Product ID");
  }

  const product = await Product.findById(id);

  if (!product) {
    return res.send("Product Not Found");
  }

  res.render("productDetails", { product });

});



router.get("/beauty", async (req,res)=>{

const products = await Product.find({category:"Beauty"});

res.render("Beauty",{products});

});


router.get("/jewellery", async (req,res)=>{

const products = await Product.find({category:"Jewellery"});

res.render("Jewellery",{products});

});


// Buy-now

router.get("/buy-now/:id", async(req, res) => {

  const id = req.params.id;

  const product = await Product.findById(id);

  if (!product) {
    return res.send("Product Not Found");
  }

  res.render("buyNow", { product });

});

// Order Section
router.post("/place-order", async (req, res) => {

   const { name, email, phone, phone2, address, productId } = req.body;

   const product = await Product.findById(productId);

   if (!product) {
      return res.send("Product Not Found");
   }

   const newOrder = new Order({
      name,
      email,
      phone,
      phone2,
      address,
      payment: `Ordered ${product.name} for ₹${product.price}`,
      productId
   });

   await newOrder.save();

   res.send("Order Placed Successfully!");

});

router.get("/admin/orders", async (req, res) => {

  const orders = await Order.find().populate("productId"); // ✅ MUST

  console.log(orders); // 🔥 DEBUG

  res.render("adminOrders", { orders });

});



router.get('/', async (req, res) => {

  const products = await Product.find().limit(8); // latest 8

  res.render('index', { products });

});

// search
router.get("/search", async (req, res) => {

  const query = req.query.query;

  const products = await Product.find({
    $or: [
      { name: { $regex: query, $options: "i" } },
      { category: { $regex: query, $options: "i" } }
    ]
  });

  res.render("index", { products });

});

router.get("/about", (req, res) => {
  res.render("about");
});






module.exports = router;

