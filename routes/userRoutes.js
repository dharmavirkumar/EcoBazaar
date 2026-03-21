const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const Product = require("../models/Product");
const Order = require("../models/Order");
const Review = require("../models/Review");
const transporter = require("../config/email");




const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

function generateInvoice(order, product) {
  const filePath = path.join(__dirname, `../invoices/invoice_${Date.now()}.pdf`);

  const doc = new PDFDocument();

  doc.pipe(fs.createWriteStream(filePath));

  // Title
  doc.fontSize(20).text("INVOICE", { align: "center" });

  doc.moveDown();

  // Customer
  doc.fontSize(12).text(`Name: ${order.name}`);
  doc.text(`Email: ${order.email}`);
  doc.text(`Phone: ${order.phone}`);

  doc.moveDown();

  // Product
  doc.text(`Product: ${product.name}`);
  doc.text(`Price: ₹${product.price}`);
  doc.text(`Size: ${order.size || "N/A"}`);

  doc.moveDown();

  doc.text(`Address: ${order.address}`);

  doc.moveDown();
  doc.text("Thank you for your purchase ❤️");

  doc.end();

  return filePath;
}


// ================= MULTER =================
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "ecommerce-products",
    allowed_formats: ["jpg", "png", "jpeg"],
  },
});

const upload = multer({ storage: storage });

// ================= HOME =================
router.get("/", async (req, res) => {
  const products = await Product.find().limit(8);
  res.render("index", { products });
});

// ================= CATEGORY =================
router.get("/electronics", async (req, res) => {
  const products = await Product.find({ category: "electronics" });
  res.render("Electronics", { products });
});

router.get("/men", async (req, res) => {
  const products = await Product.find({ category: "fashion" });
  res.render("men", { products });
});

router.get("/beauty", async (req, res) => {
  const products = await Product.find({ category: "Beauty" });
  res.render("Beauty", { products });
});

router.get("/jewellery", async (req, res) => {
  const products = await Product.find({ category: "Jewellery" });
  res.render("Jewellery", { products });
});

// ================= ADD PRODUCT =================
router.get("/add-product", (req, res) => {
  res.render("Products");
});

router.post('/add-product', upload.single("image"), async (req,res)=>{

   const { name, price, description, category } = req.body;

   const image = req.file ? req.file.path : "";

   const newProduct = new Product({
      name,
      price,
      description,
      category,
      image
   });

   await newProduct.save();

   res.redirect('/');
});

// ================= PRODUCT DETAILS =================
router.get("/product/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.send("Invalid Product ID");
    }

    const product = await Product.findById(id);
    if (!product) return res.send("Product not found");

    const similarProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
    }).limit(4);

    const reviews = await Review.find({ productId: product._id });

    let avgRating = 0;
    if (reviews.length > 0) {
      avgRating =
        reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;
    }

    res.render("productDetails", {
      product,
      similarProducts,
      reviews,
      avgRating,
    });
  } catch (err) {
    console.log(err);
    res.send("Error loading product");
  }
});

// ================= SEARCH =================
router.get("/search", async (req, res) => {
  const query = req.query.query;

  const products = await Product.find({
    $or: [
      { name: { $regex: query, $options: "i" } },
      { category: { $regex: query, $options: "i" } },
    ],
  });

  res.render("index", { products });
});

// ================= CART =================
router.get("/add-to-cart/:id", async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!req.session.cart) req.session.cart = [];

  const cart = req.session.cart;

 const existing = cart.find(
  (item) => item._id.toString() === req.params.id
);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      _id: product._id,
      name: product.name,
      price: product.price,
      image: product.image,
      size: product.category === "fashion" ? product.size : null,
      qty: 1,
    });
  }

  res.redirect("/cart");
});

router.get("/cart", (req, res) => {
  const cart = req.session.cart || [];

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  res.render("cart", { cart, total });
});

// ================= CHECKOUT =================
router.get("/checkout", (req, res) => {
  const cart = req.session.cart || [];

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  res.render("checkout", { cart, total });
});

router.post("/checkout", async (req, res) => {
  try {
    const { name, email, phone, phone2, address } = req.body;
    const cart = req.session.cart || [];

    if (cart.length === 0) {
      return res.send("Cart is empty");
    }

    for (let item of cart) {
      await new Order({
        name,
        email,
        phone,
        phone2,
        address,
        productId: item._id,
        size: item.size || null,
        payment: `Ordered ${item.name} x ${item.qty}`,
      }).save();
    }
// ✅ Generate invoice HERE
const filePath = generateInvoice(newOrder, product);

// ✅ Send email with attachment
await transporter.sendMail({
  from: process.env.EMAIL_USER,
  to: email,
  subject: "Order Confirmation 🛒",
  html: `
    <h2>Thanks ${name}! 🎉</h2>

    <p>Your order has been placed successfully.</p>

    <h3>🛒 Product Details:</h3>
    <p><b>Name:</b> ${product.name}</p>
    <p><b>Price:</b> ₹${product.price}</p>
    <p><b>Size:</b> ${size || "N/A"}</p>

    <img src="${product.image}" width="200"/>

    <p>📦 Delivery within 3-5 days</p>
  `,
  attachments: [
    {
      filename: "invoice.pdf",
      path: filePath,
    },
  ],
});


    req.session.cart = [];

    res.render("orderSuccess");
  } catch (err) {
    console.log(err);
    res.send("Checkout failed");
  }
});

// ================= BUY NOW =================
router.get("/buy-now/:id", async (req, res) => {
  const product = await Product.findById(req.params.id);
  res.render("buyNow", { product });
});

// ================= SINGLE ORDER =================
router.post("/place-order", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      phone2,
      house,
      area,
      city,
      state,
      pincode,
      landmark,
      productId,
      size
    } = req.body;

    // 🔥 Create address
    const address = `
    ${house}, ${area},
    ${city}, ${state} - ${pincode}
    ${landmark ? "Landmark: " + landmark : ""}
    `;

    const product = await Product.findById(productId);

    if (!product) {
      return res.send("Product not found");
    }

    const newOrder = new Order({
      name,
      email,
      phone,
      phone2,
      address,
      productId,
      size: product.category === "fashion" ? (size || "M") : null,
      payment: `Ordered ${product.name} for ₹${product.price}`,
    });

    await newOrder.save();

    // ✅ EMAIL SAFE
    await transporter.sendMail({
  from: process.env.EMAIL_USER,
  to: email,
  subject: "Order Confirmation 🛒",
  html: `
    <h2>Thanks ${name}! 🎉</h2>

    <p>Your order has been placed successfully.</p>

    <h3>🛒 Product Details:</h3>
    <p><b>Name:</b> ${product.name}</p>
    <p><b>Price:</b> ₹${product.price}</p>
    <p><b>Size:</b> ${size || "N/A"}</p>

    <img src="${product.image}" width="200" style="border-radius:10px"/>

    <p>📦 Delivery within 3-5 days</p>
  `,
});

    res.render("orderSuccess");

  } catch (err) {
    console.log("ORDER ERROR:", err);
    res.send("Order failed");
  }
});

// ================= ADMIN =================
router.get("/admin/orders", async (req, res) => {
  const orders = await Order.find().populate("productId");
  res.render("adminOrders", { orders });
});

// ================= REVIEW =================
router.post("/add-review", async (req, res) => {
  const { productId, name, rating, comment } = req.body;

  await new Review({
    productId,
    name,
    rating,
    comment,
  }).save();

  res.redirect("/product/" + productId);
});

// ================= STATIC =================
router.get("/about", (req, res) => res.render("about"));



router.get("/remove-from-cart/:id", (req, res) => {

  const id = req.params.id;

  let cart = req.session.cart || [];

  // filter out item
  cart = cart.filter(item => item._id.toString() !== id);

  // update session
  req.session.cart = cart;

  res.redirect("/cart");
});

module.exports = router;