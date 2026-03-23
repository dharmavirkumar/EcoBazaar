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
const bcrypt = require("bcrypt");
const User = require("../models/User");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");


function isLoggedIn(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

// ✅ My Orders Page
router.get("/my-orders", isLoggedIn, async (req, res) => {

  const orders = await Order.find({
    userId: req.session.user._id
  }).populate("productId").sort({ createdAt: -1 });

  res.render("myOrders", { orders });
});
 
// Register page
router.get("/register", (req, res) => {
  res.render("register");
});

// Register logic
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // check existing user
    const existing = await User.findOne({ email });
    if (existing) {
      return res.send("User already exists");
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashedPassword
    });

    await newUser.save();

    res.redirect("/login");

  } catch (err) {
    console.log(err);
    res.send("Registration failed");
  }
});



// Login page
router.get("/login", (req, res) => {
  res.render("login");
});

// Login logic
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.send("User not found");
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.send("Wrong password");
    }

    // ✅ SESSION SAVE
    req.session.user = user;

    res.redirect("/");

  } catch (err) {
    console.log(err);
    res.send("Login failed");
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});


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


router.get("/download-invoice/:id", isLoggedIn, async (req, res) => {
  const order = await Order.findById(req.params.id).populate("productId");

  if (!order) return res.send("Order not found");

  const doc = new PDFDocument();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=invoice.pdf");

  doc.pipe(res);

  doc.fontSize(20).text("INVOICE", { align: "center" });

  doc.moveDown();
  doc.text(`Name: ${order.name}`);
  doc.text(`Email: ${order.email}`);
  doc.text(`Phone: ${order.phone}`);

  doc.moveDown();
  doc.text(`Product: ${order.productId.name}`);
  doc.text(`Price: ₹${order.productId.price}`);
  doc.text(`Status: ${order.status}`);

  doc.moveDown();
  doc.text(`Address: ${order.address}`);

  doc.end();
});


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
  try {
    const query = req.query.q;

    if (!query) {
      return res.redirect("/");
    }

    const products = await Product.find({
      $or: [
        { name: { $regex: query, $options: "i" } },
        { category: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } }
      ]
    });

    res.render("searchResults", { products, query });

  } catch (err) {
    console.log(err);
    res.send("Search failed");
  }
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

router.get("/checkout", isLoggedIn, (req, res) => {
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

router.get("/buy-now/:id", isLoggedIn, async (req, res) => {
  const product = await Product.findById(req.params.id);
  res.render("buyNow", { product });
});

// ================= SINGLE ORDER =================


   router.post("/place-order",isLoggedIn, async (req, res) => {
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

    // 🔥 Address combine
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
      userId: req.session.user._id, // ✅ IMPORTANT
      size: product.category === "fashion" ? (size || "M") : null,
      payment: `Ordered ${product.name} for ₹${product.price}`,
    });

    await newOrder.save(); // ✅ ORDER SAVED

    // ✅ EMAIL (SAFE BLOCK)
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Order Confirmation 🛒",
        html: `
          <h2>Thanks ${name}! 🎉</h2>
          <p>Your order has been placed successfully.</p>

          <h3>${product.name}</h3>
          <p>₹${product.price}</p>

          <img src="${product.image}" width="200"/>

          <p>📦 Delivery within 3-5 days</p>
        `,
      });
    } catch (emailErr) {
      console.log("❌ Email failed:", emailErr.message);
    }

    // ✅ FINAL RESPONSE (IMPORTANT)
    res.render("orderSuccess");

  } catch (err) {
    console.log("ORDER ERROR:", err);
    res.send("Order failed");
  }
});

router.get("/cancel-order/:id", isLoggedIn, async (req, res) => {
  await Order.findByIdAndUpdate(req.params.id, {
    status: "Cancelled"
  });

  res.redirect("/my-orders");
});

// ================= ADMIN =================
// router.get("/admin/orders", async (req, res) => {
//   const orders = await Order.find().populate("productId");
//   res.render("adminOrders", { orders });
// });

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


// Update Order Status
router.post("/admin/update-status/:id", async (req, res) => {
  try {
    const { status } = req.body;

    await Order.findByIdAndUpdate(req.params.id, { status });

    res.redirect("/admin/orders");

  } catch (err) {
    console.log(err);
    res.send("Status update failed");
  }
});

function isAdmin(req, res, next) {
  if (!req.session.user || req.session.user.email !== "admin@gmail.com") {
    return res.send("Access Denied");
  }
  next();
}

router.get("/admin/orders", isAdmin, async (req, res) => {
  const orders = await Order.find().populate("productId");
  res.render("adminOrders", { orders });
});

router.get("/admin/products", async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.render("adminProducts", { products });
});

router.get("/admin/edit-product/:id", async (req, res) => {
  const product = await Product.findById(req.params.id);
  res.render("editProduct", { product });
});

router.post("/admin/edit-product/:id", upload.single("image"), async (req, res) => {

  const { name, price, description, category } = req.body;

  const updateData = {
    name,
    price,
    description,
    category
  };

  if (req.file) {
    updateData.image = req.file.path;
  }

  await Product.findByIdAndUpdate(req.params.id, updateData);

  res.redirect("/admin/products");
});


router.get("/admin/delete-product/:id", async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.redirect("/admin/products");
});

router.get("/admin/dashboard", async (req, res) => {

  const totalProducts = await Product.countDocuments();
  const totalOrders = await Order.countDocuments();

  const orders = await Order.find();

 let revenue = 0;

orders.forEach(o => {
  if (o.payment) {
    const match = o.payment.match(/\d+/);
    if (match) {
      revenue += parseInt(match[0]);
    }
  }
});

  
  res.render("adminDashboard", {
    totalProducts,
    totalOrders,
    revenue
  });
});

router.get("/admin/products/search", async (req, res) => {
  const q = req.query.q;

  const products = await Product.find({
    name: { $regex: q, $options: "i" }
  });

  res.render("adminProducts", { products });
});








module.exports = router;