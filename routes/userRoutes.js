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
const QRCode = require("qrcode");



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




// invoice


router.get("/download-invoice/:id", isLoggedIn, async (req, res) => {

  const order = await Order.findById(req.params.id).populate("productId");
  if (!order) return res.send("Order not found");

  const doc = new PDFDocument({ margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=invoice.pdf");

  doc.pipe(res);

  // 🟡 LOGO
  const logoPath = path.join(__dirname, "../public/logo.png");

  try {
    doc.image(logoPath, 40, 30, { width: 100 });
  } catch {
    doc.fontSize(22).text("LioKart", 40, 40);
  }

  // 🧾 TITLE
  doc.fontSize(18).text("INVOICE", 450, 40);

  // 🧾 ORDER INFO
  doc.fontSize(10);
  doc.text(`Order ID: ${order._id}`, 350, 80);
  doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, 350, 95);
  doc.text(`Status: ${order.status}`, 350, 110);

  // 👤 BILLING
  doc.fontSize(12).text("Billing Details", 40, 110);
  doc.fontSize(10);

  doc.text(order.name, 40, 125);
  doc.text(order.email, 40, 140);
  doc.text(order.phone, 40, 155);
  doc.text(order.address, 40, 170);

  // 📦 TABLE HEADER
  const tableTop = 230;

  doc.font("Helvetica-Bold");
  doc.text("Product", 40, tableTop);
  doc.text("Price", 300, tableTop);
  doc.text("Qty", 370, tableTop);
  doc.text("Total", 440, tableTop);

  doc.moveTo(40, tableTop + 15).lineTo(550, tableTop + 15).stroke();

  doc.font("Helvetica");

  // 📦 PRODUCT
  const product = order.productId;
  const qty = 1;
  const total = product.price;

  const nameHeight = doc.heightOfString(product.name, { width: 240 });

  const rowY = tableTop + 25;

  doc.text(product.name, 40, rowY, { width: 240 });
  doc.text(`₹${product.price}`, 300, rowY);
  doc.text(qty, 370, rowY);
  doc.text(`₹${total}`, 440, rowY);

  doc.moveTo(40, rowY + nameHeight + 10)
     .lineTo(550, rowY + nameHeight + 10)
     .stroke();

  // 💰 TOTAL BOX
  const boxY = rowY + nameHeight + 30;

  doc.rect(300, boxY, 250, 90).stroke();

  doc.text("Subtotal:", 310, boxY + 10);
  doc.text(`₹${total}`, 480, boxY + 10);

  doc.text("Delivery:", 310, boxY + 30);
  doc.text("₹0", 480, boxY + 30);

  doc
    .fontSize(13)
    .fillColor("green")
    .text("Grand Total:", 310, boxY + 60);

  doc.text(`₹${total}`, 480, boxY + 60);

  doc.fillColor("black");

  // 🔲 QR CODE (ORDER TRACK LINK)
  const qrData = `https://liokart.shop/order/${order._id}`;

  const qrImage = await QRCode.toDataURL(qrData);

  const qrBase64 = qrImage.replace(/^data:image\/png;base64,/, "");
  const qrBuffer = Buffer.from(qrBase64, "base64");

  doc.image(qrBuffer, 40, boxY, { width: 100 });

  doc.fontSize(8).text("Scan to track order", 40, boxY + 105);

  // 📝 FOOTER
  doc.moveTo(40, boxY + 130)
     .lineTo(550, boxY + 130)
     .stroke();

  doc.fontSize(10).text("Thank you for shopping with LioKart ❤️", 40, boxY + 140, {
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
  const products = await Product.find().limit(20);
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

  const { name, price, description, category, discountType, discountValue,mainCategory, subCategory} = req.body;

  // ✅ MULTIPLE IMAGES ARRAY
  const images = req.files.map(file => file.path);

  let finalPrice = price;

  let sizes = [];

if (subCategory === "Jeans") {
  sizes = [
    { size: "26", price: 309 },
    { size: "28", price: 324 },
    { size: "30", price: 339 }
  ];
}

if (subCategory === "Shoes") {
  sizes = [
    { size: "7", price: 799 },
    { size: "8", price: 849 },
    { size: "9", price: 899 }
  ];
}

if (subCategory === "Shirts") {
  sizes = [
    { size: "S", price: 499 },
    { size: "M", price: 499 },
    { size: "L", price: 499 }
  ];
}
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
    finalPrice,
    sizes
  });

  await newProduct.save();

  res.redirect('/admin');
});



// router.get("/category/:main/:sub", async (req, res) => {
//   const { main, sub } = req.params;

//   const products = await Product.find({
//     mainCategory: { $regex: `^${main}$`, $options: "i" },
//     subCategory: { $regex: sub, $options: "i" }
//   });

//   res.render("categoryPage", { products, main, sub });
// });



router.get("/category/:main/:sub", async (req, res) => {
  const { main, sub } = req.params;

  let filter = {
    mainCategory: { $regex: `^${main}$`, $options: "i" }
  };

  // ✅ Agar "All" hai to sirf mainCategory filter karo
  if (sub !== "All") {
    filter.subCategory = { $regex: sub, $options: "i" };
  }

  const products = await Product.find(filter);

  // ✅ Dynamic subcategories fetch karo
  const subCategories = await Product.distinct("subCategory", {
    mainCategory: { $regex: `^${main}$`, $options: "i" }
  });

  res.render("categoryPage", {
    products,
    main,
    sub,
    subCategories
  });
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
    let query = req.query.q?.toLowerCase().trim();

    if (!query) return res.redirect("/");

    let products = await Product.find({
      name: { $regex: query, $options: "i" }
    });

    // 🤖 TYPO FIX (if no results)
    if (products.length === 0) {
      const allNames = await Product.find().select("name");

      let closest = null;
      let minDist = Infinity;

      allNames.forEach(p => {
        const dist = levenshtein(query, p.name.toLowerCase());
        if (dist < minDist) {
          minDist = dist;
          closest = p.name;
        }
      });

      if (closest) {
        products = await Product.find({
          name: { $regex: closest, $options: "i" }
        });

        return res.render("searchResults", {
          products,
          query,
          suggestion: closest
        });
      }
    }

    res.render("searchResults", { products, query });

  } catch (err) {
    res.send("Search failed");
  }
});

router.get("/api/search", async (req, res) => {
  try {
    const query = req.query.q?.trim();

    if (!query) return res.json([]);

    const products = await Product.find({
      name: { $regex: query, $options: "i" }
    })
    .limit(8)
    .select("name price finalPrice images");

    res.json(products);

  } catch (err) {
    console.log(err);
    res.json([]);
  }
});

// 🔥 HELPER FUNCTION
function levenshtein(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
    }
  }

  return matrix[b.length][a.length];
}
// 🔥 SUGGESTIONS API
router.get("/api/suggestions", async (req, res) => {
  try {
    const keywords = await Product.aggregate([
      {
        $group: {
          _id: "$subCategory",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]);

    res.json(keywords.map(k => k._id));

  } catch (err) {
    res.json([]);
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

          <p>📦 Delivery within 4-5 days</p>
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

// INCREASE QTY
router.get("/increase-qty/:id", (req, res) => {
  const id = req.params.id;

  const cart = req.session.cart || [];

  const item = cart.find(p => p._id == id);

  if (item) {
    item.qty += 1;
  }

  req.session.cart = cart;

  res.redirect("/cart");
});


// DECREASE QTY
router.get("/decrease-qty/:id", (req, res) => {
  const id = req.params.id;

  let cart = req.session.cart || [];

  const item = cart.find(p => p._id == id);

  if (item) {
    item.qty -= 1;

    // ❌ Remove item if qty becomes 0
    if (item.qty <= 0) {
      cart = cart.filter(p => p._id != id);
    }
  }

  req.session.cart = cart;

  res.redirect("/cart");
});




module.exports = router;