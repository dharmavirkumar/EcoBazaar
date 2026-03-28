const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");
const otpGenerator = require("otp-generator");

const Product = require("../models/Product");
const Order = require("../models/Order");
const Review = require("../models/Review");
const transporter = require("../config/email");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const razorpay = require("../config/razorpay");


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
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) return res.send("User exists");

  const hashedPassword = await bcrypt.hash(password, 10);

  const otp = otpGenerator.generate(6, { digits: true, alphabets: false });

  const user = new User({
    name,
    email,
    password: hashedPassword,
    otp,
    otpExpiry: Date.now() + 5 * 60 * 1000 // 5 min
  });

  await user.save();

  // 📧 Send OTP
  await transporter.sendMail({
    to: email,
    subject: "OTP Verification",
    html: `<h2>Your OTP is: ${otp}</h2>`
  });

  res.render("verifyOtp", { email });
});


router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email });

  if (!user || user.otp !== otp || user.otpExpiry < Date.now()) {
    return res.send("Invalid or expired OTP");
  }

  user.isVerified = true;
  user.otp = null;

  await user.save();

  res.redirect("/login");
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




router.get("/download-invoice/:id", isLoggedIn, async (req, res) => {
  const order = await Order.findById(req.params.id).populate("productId");

  if (!order) return res.send("Order not found");

  const doc = new PDFDocument({ margin: 50 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=invoice.pdf");

  doc.pipe(res);

  // 🟡 HEADER
  doc
    .fontSize(22)
    .fillColor("#2874f0")
    .text("LioKart", 50, 50);

  doc
    .fontSize(10)
    .fillColor("black")
    .text("Invoice", 450, 50);

  doc.moveDown(2);

  // 🧾 ORDER INFO
  doc.fontSize(10);
  doc.text(`Order ID: ${order._id}`);
  doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`);
  doc.text(`Status: ${order.status}`);

  doc.moveDown();

  // 👤 CUSTOMER INFO
  doc
    .fontSize(12)
    .text("Billing Details", { underline: true });

  doc.fontSize(10);
  doc.text(`Name: ${order.name}`);
  doc.text(`Email: ${order.email}`);
  doc.text(`Phone: ${order.phone}`);
  doc.text(`Address: ${order.address}`);

  doc.moveDown();

  // 📦 TABLE HEADER
  doc
    .fontSize(12)
    .text("Product Details", { underline: true });

  doc.moveDown(0.5);

  const tableTop = doc.y;

  doc.fontSize(10).text("Product", 50, tableTop);
  doc.text("Price", 300, tableTop);
  doc.text("Qty", 370, tableTop);
  doc.text("Total", 430, tableTop);

  doc.moveTo(50, tableTop + 15)
     .lineTo(550, tableTop + 15)
     .stroke();

  // 📦 PRODUCT ROW
  const product = order.productId;

  const qty = order.quantity || 1;
  const total = product.price * qty;

  const rowY = tableTop + 25;

  doc.text(product.name, 50, rowY);
  doc.text(`₹${product.price}`, 300, rowY);
  doc.text(qty, 370, rowY);
  doc.text(`₹${total}`, 430, rowY);

  doc.moveTo(50, rowY + 15)
     .lineTo(550, rowY + 15)
     .stroke();

  doc.moveDown(3);

  // 💰 TOTAL SECTION
  doc.fontSize(12);

  doc.text(`Subtotal: ₹${total}`, { align: "right" });
  doc.text(`Delivery: ₹0`, { align: "right" });

  doc
    .fontSize(14)
    .fillColor("green")
    .text(`Grand Total: ₹${total}`, { align: "right" });

  doc.fillColor("black");

  doc.moveDown(2);

  // 📝 FOOTER
  doc
    .fontSize(10)
    .text("Thank you for shopping with LioKart ❤️", {
      align: "center",
    });

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
  res.render("index", {
  products,
  user: req.session.user,
  cartCount: req.session.cart ? req.session.cart.length : 0
});
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
  const products = await Product.find({
    category: { $regex: "beauty", $options: "i" }
  });
  res.render("Beauty", { products });
});

router.get("/jewellery", async (req, res) => {
const products = await Product.find({
  category: { $regex: "jewellery", $options: "i" }
});
res.render("Jewellery", { products });
});

// ================= ADD PRODUCT =================


router.post('/add-product', upload.array("images", 5), async (req, res) => {

  const { name, price, description, category, discountType, discountValue,mainCategory, subCategory } = req.body;

  // ✅ MULTIPLE IMAGES ARRAY
  const images = req.files.map(file => file.path);

  let finalPrice = price;

  // ✅ DISCOUNT LOGIC
  if (discountType === "percentage") {
    finalPrice = price - (price * discountValue / 100);
  } 
  else if (discountType === "flat") {
    finalPrice = price - discountValue;
  }

  const newProduct = new Product({
    name,
    price,
    description,
    category,
    images,
    discountType,
    discountValue,
    mainCategory,
    subCategory,
    finalPrice
  });

  await newProduct.save();

  res.redirect('/admin');
});



// router.get("/category/:main/:sub", async (req, res) => {
//   const { main, sub } = req.params;

//   const products = await Product.find({
//     mainCategory: main,
//     subCategory: { $regex: sub, $options: "i" } // 🔥 FIX
//   });

//   res.render("categoryPage", { products, main, sub });
// });


router.get("/category/:main/:sub", async (req, res) => {
  const { main, sub } = req.params;

  const products = await Product.find({
    mainCategory: { $regex: `^${main}$`, $options: "i" },
    subCategory: { $regex: sub, $options: "i" }
  });

  res.render("categoryPage", { products, main, sub });
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

  if (!req.session.cart) {
    req.session.cart = [];
  }

  let cart = req.session.cart;

  let existing = cart.find(item => item._id == product._id);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      _id: product._id,
      name: product.name,
      price: product.price,
      qty: 1,

      // ✅ FINAL IMAGE FIX
      image: product.images?.[0] || product.image || "default.png"
    });
  }

  res.redirect("/cart");
});

router.get("/cart", (req, res) => {

  let cart = req.session.cart || [];

  let total = cart.reduce((sum, item) => {
    return sum + item.price * item.qty;
  }, 0);

  res.render("cart", { cart, total });

});


// ================= CHECKOUT =================
router.get("/checkout", isLoggedIn, (req, res) => { 
  const cart = req.session.cart || []; 
  const total = cart.reduce( (sum, item) => sum + item.price * item.qty, 0 ); 

  res.render("checkout", { cart, total }); });

  
router.post("/checkout", isLoggedIn, async (req, res) => {
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
      landmark
    } = req.body;

    const cart = req.session.cart || [];

    if (cart.length === 0) {
      return res.send("Cart is empty");
    }

    // 🔥 Address combine (same as Buy Now)
    const address = `
      ${house}, ${area},
      ${city}, ${state} - ${pincode}
      ${landmark ? "Landmark: " + landmark : ""}
    `;

    let firstOrder = null;
    let firstProduct = null;

    for (let item of cart) {

      const product = await Product.findById(item._id);

      if (!product) continue;

      const newOrder = new Order({
        name,
        email,
        phone,
        phone2,
        address,
        productId: item._id,
        userId: req.session.user._id,
        size: item.size || null,
        payment: `Ordered ${product.name} x ${item.qty}`
      });

      await newOrder.save();

      // ✅ Save first order (for email/invoice)
      if (!firstOrder) {
        firstOrder = newOrder;
        firstProduct = product;
      }
    }

    // ✅ EMAIL (same clean logic as Buy Now)
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Order Confirmation 🛒",
        html: `
          <h2>Thanks ${name}! 🎉</h2>
          <p>Your order has been placed successfully.</p>

          <h3>${firstProduct.name}</h3>
          <p>₹${firstProduct.price}</p>

          <img src="${firstProduct.images[0]}" width="200"/>

          <p>📦 Delivery within 3-5 days</p>
        `
      });
    } catch (err) {
      console.log("Email failed:", err.message);
    }

    // ✅ CLEAR CART
    req.session.cart = [];

    res.render("orderSuccess");

  } catch (err) {
    console.log("Checkout Error:", err);
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

          <img src="${product.images[0]}" width="200"/>

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

// ================= EDIT PRODUCT PAGE =================
router.get("/admin/edit-product/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // 🔥 IMPORTANT FIX (CastError avoid)
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.send("Invalid Product ID");
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.send("Product not found");
    }

    res.render("editProduct", { product });

  } catch (err) {
    console.log("Edit GET Error:", err);
    res.send("Error loading edit page");
  }
});


// ================= UPDATE PRODUCT =================
router.post("/admin/edit-product/:id", upload.array("images", 5), async (req, res) => {
  try {
    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.send("Invalid Product ID");
    }

    const {
      name,
      price,
      description,
      category,
      mainCategory,
      subCategory,
      discountType,
      discountValue
    } = req.body;

    let images = [];

    // ✅ OLD IMAGES (जो user ने delete नहीं की)
    if (req.body.existingImages) {
      if (Array.isArray(req.body.existingImages)) {
        images = req.body.existingImages;
      } else {
        images = [req.body.existingImages];
      }
    }

    // ✅ NEW IMAGES ADD
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => file.path);
      images = images.concat(newImages);
    }

    // ✅ DISCOUNT CALCULATION
    let finalPrice = price;

    if (discountType === "percentage") {
      finalPrice = price - (price * discountValue / 100);
    } else if (discountType === "flat") {
      finalPrice = price - discountValue;
    }

    await Product.findByIdAndUpdate(id, {
      name,
      price,
      description,
      category,
      mainCategory,
      subCategory,
      discountType,
      discountValue,
      finalPrice,
      images
    });

    res.redirect("/admin/products");

  } catch (err) {
    console.log("Edit POST Error:", err);
    res.send("Update failed");
  }
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
  try {
    let q = req.query.q;

    // ✅ SAFETY CHECK
    if (!q || typeof q !== "string") {
      return res.redirect("/admin/products");
    }

    q = q.trim(); // remove spaces

    const products = await Product.find({
      name: { $regex: q, $options: "i" }
    });

    res.render("adminProducts", { products });

  } catch (err) {
    console.log("Search Error:", err);
    res.send("Search failed");
  }
});


router.get("/admin", isAdmin, async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  const orders = await Order.find().populate("productId");

  const totalProducts = await Product.countDocuments();
  const totalOrders = await Order.countDocuments();

  let revenue = 0;
  orders.forEach(o => {
    const match = o.payment?.match(/\d+/);
    if (match) revenue += parseInt(match[0]);
  });

  res.render("adminPanel", {
    products,
    orders,
    totalProducts,
    totalOrders,
    revenue
  });
});


// routes/payment.js




router.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    const options = {
      amount: amount * 100, // paise
      currency: "INR",
      receipt: "order_rcptid_" + Date.now()
    };

    const order = await razorpay.orders.create(options);

    res.json(order);

  } catch (err) {
    res.status(500).send(err);
  }
});

module.exports = router;



module.exports = router;