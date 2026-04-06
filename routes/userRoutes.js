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
const crypto = require("crypto"); 



function isLoggedIn(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

// ✅ My Orders Page
router.get("/my-orders", isLoggedIn, async (req, res) => {
  const orders = await Order.find({ userId: req.session.user._id })
    .populate("items.productId")
    .sort({ createdAt: -1 });

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

  const order = await Order.findById(req.params.id)
    .populate("items.productId");

  if (!order) return res.send("Order not found");

  // ✅ CREATE UNIQUE INVOICE NUMBER
  const invoiceNo = "INV-" + Date.now();

  const doc = new PDFDocument({ margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=${invoiceNo}.pdf`);

  doc.pipe(res);

  // ================= LOGO =================
  const logoPath = path.join(__dirname, "../public/logo.png"); // 🔥 add your logo
  try {
    doc.image(logoPath, 40, 30, { width: 80 });
  } catch (e) {}

  // ================= COMPANY NAME =================
  doc
    .fontSize(20)
    .fillColor("#2874F0")
    .text("LioKart", 130, 40);

  doc
    .fontSize(10)
    .fillColor("gray")
    .text("India's Trusted Shopping Platform", 130, 65);

  // ================= INVOICE TITLE =================
  doc
    .fontSize(18)
    .fillColor("black")
    .text("INVOICE", 400, 40);

  doc
    .fontSize(10)
    .text(`Invoice No: ${invoiceNo}`, 400, 65);

  doc.moveDown(3);

  // ================= ORDER INFO =================
  doc
    .fontSize(10)
    .text(`Order ID: ${order._id}`)
    .text(`Date: ${new Date(order.createdAt).toDateString()}`)
    .text(`Status: ${order.status}`);

  doc.moveDown();

  // ================= CUSTOMER + ADDRESS =================
  doc
    .fontSize(12)
    .text("Billing & Shipping Address", { underline: true });

  doc
    .fontSize(10)
    .text(order.name)
    .text(order.email)
    .text(order.phone)
    .text(
      `${order.address?.house}, ${order.address?.area}, ${order.address?.city}, ${order.address?.state} - ${order.address?.pincode}`
    );

  if (order.address?.landmark) {
    doc.text(`Landmark: ${order.address.landmark}`);
  }

  doc.moveDown();

  // ================= TABLE HEADER =================
  const tableTop = doc.y;

  doc.rect(40, tableTop, 520, 20).fill("#2874F0");

  doc
    .fillColor("white")
    .fontSize(10)
    .text("Image", 50, tableTop + 5)
    .text("Product", 110, tableTop + 5)
    .text("Price", 300, tableTop + 5)
    .text("Qty", 370, tableTop + 5)
    .text("Total", 430, tableTop + 5);

  let y = tableTop + 30;

  // ================= ITEMS =================
  doc.fillColor("black");

  const fs = require("fs");

order.items.forEach(item => {

  const product = item.productId;

  let imgPath = path.join(
    process.cwd(),
    "public/uploads",
    item.image
  );

  if (fs.existsSync(imgPath)) {
    doc.image(imgPath, 50, y, { width: 40, height: 40 });
  }

  doc
    .fontSize(10)
    .text(product?.name || item.name, 110, y)
    .text(`₹${product?.price || item.price}`, 300, y)
    .text(item.quantity, 370, y)
    .text(`₹${(product?.price || item.price) * item.quantity}`, 430, y);

  y += 50;
});

  // ================= PRICE BREAKDOWN =================
  let shipping = 0;
  let gst = Math.round(order.totalAmount * 0.10); // 10% GST

  y += 10;

  doc.moveTo(300, y).lineTo(550, y).stroke();

  y += 10;

  doc.text("Subtotal:", 350, y);
  doc.text(`₹${order.totalAmount - gst}`, 450, y);

  y += 15;

  doc.text("GST (10%):", 350, y);
  doc.text(`₹${gst}`, 450, y);

  y += 15;

  doc.text("Shipping:", 350, y);
  doc.text(shipping === 0 ? "FREE" : `₹${shipping}`, 450, y);

  y += 15;

  doc.fontSize(12).text("Total Amount:", 350, y);
  doc.text(`₹${order.totalAmount}`, 450, y);

  // ================= PAYMENT =================
  doc.moveDown(2);

  doc
    .fontSize(10)
    .text(`Payment Method: ${order.paymentMethod}`)
    .text(`Payment Status: ${order.paymentStatus}`);

  // ================= FOOTER =================
  doc.moveDown(3);

  doc
    .fontSize(10)
    .fillColor("gray")
    .text("Thank you for shopping with LioKart ❤️", {
      align: "center"
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
router.get('/add-product', (req, res) => {
  res.render('Products');
});
router.post('/add-product', upload.array("images", 5), async (req, res) => {
  
  try {
    

    let {
      name,
      price,
      description,
      category,
      discountType,
      discountValue,
      mainCategory,
      subCategory,
       
    } = req.body;

    
    // ✅ FIX: convert to number
    price = Number(price);
    discountValue = Number(discountValue) || 0;

   // ✅ SAFE IMAGE HANDLING
const images = req.files ? req.files.map(file => file.path) : [];


// 🔥 ADD HERE 👇👇

// ✅ HIGHLIGHTS ARRAY
const highlights = req.body.highlights || [];

// ✅ SPECIFICATIONS MAP
let specifications = {};

if (req.body.specKey && req.body.specValue) {
  req.body.specKey.forEach((key, index) => {
    if (key && req.body.specValue[index]) {
      specifications[key] = req.body.specValue[index];
    }
  });
}

    let finalPrice = price;

    // ✅ DISCOUNT LOGIC (SAFE)
    if (discountType === "percentage") {
      finalPrice = price - (price * discountValue / 100);
    } 
    else if (discountType === "flat") {
      finalPrice = price - discountValue;
    }

    // ❗ NEVER GO BELOW 0
    if (finalPrice < 0) finalPrice = 0;

    // ✅ DYNAMIC SIZE SYSTEM
    let sizes = [];

    const sizeMap = {
      Jeans: [
        { size: "26" },
        { size: "28" },
        { size: "30" }
      ],
      Shoes: [
        { size: "7" },
        { size: "8" },
        { size: "9" }
      ],
      Shirts: [
        { size: "S" },
        { size: "M"},
        { size: "L" }
      ]
    };

    if (sizeMap[subCategory]) {
      sizes = sizeMap[subCategory];
    }

    // ✅ CREATE PRODUCT
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

  highlights,
  specifications,
      finalPrice,
      sizes
    });

    await newProduct.save();

    res.redirect('/admin');

  } catch (err) {
    console.log("ADD PRODUCT ERROR:", err);
    res.status(500).send("Something went wrong");
  }
});


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
  const total = cart.reduce(
    (sum, item) => sum + item.price * item.qty, 0
  ); 

 res.render("checkout", {
  cart,
  total,
  razorpayKey: process.env.RAZORPAY_KEY_ID
});
});
  
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
      landmark,
      paymentMethod // 🔥 new field
    } = req.body;

    const cart = req.session.cart || [];

    if (cart.length === 0) {
      return res.send("Cart is empty");
    }

    let firstProduct = null;
    let totalAmount = 0;
    let items = [];

    // 🔥 LOOP CART
    for (let item of cart) {

      const product = await Product.findById(item._id);
      if (!product) continue;

      items.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: item.qty,
        image: product.images?.[0] || "/default.png"
      });

      totalAmount += product.price * item.qty;

      if (!firstProduct) {
        firstProduct = product;
      }
    }

    // 🔥 PAYMENT LOGIC
    let paymentStatus = "Pending";

   if (paymentMethod?.toUpperCase() === "ONLINE") {
  paymentStatus = "Paid"; // only after verification (already handled)
} else {
  paymentStatus = "Pending";
}

    // 🔥 CREATE ORDER
    const newOrder = new Order({
      userId: req.session.user._id,

      name,
      email,
      phone,
      phone2,

      address: {
        fullName: name,
        mobile: phone,
        house,
        area,
        city,
        state,
        pincode,
        landmark
      },

      items,
      totalAmount,

      paymentMethod: paymentMethod || "COD",
      paymentStatus,

      status: "Placed",
      timeline: [{ status: "Placed" }]
    });

    await newOrder.save();

    // ✅ EMAIL
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Order Confirmation 🛒",
        html: `
          <h2>Thanks ${name}! 🎉</h2>
          <p>Your order has been placed successfully.</p>

          <h3>${firstProduct?.name}</h3>
          <p>₹${firstProduct?.price}</p>

          <img src="${firstProduct?.images?.[0]}" width="200"/>

          <p><b>Total Amount:</b> ₹${totalAmount}</p>

          <p><b>Payment:</b> ${paymentMethod}</p>

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

router.post("/place-order", isLoggedIn, async (req, res) => {
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

    // ✅ BASIC VALIDATION
    if (!name || !phone || !house || !area || !city || !state || !pincode) {
      return res.send("All required fields missing");
    }

    // ✅ PRODUCT FETCH
   const product = await Product.findById(productId);

if (!product) {
  console.log("❌ Product not found:", productId);
  return res.json({ success: false, message: "Product not found" });
}

const productImage =
  product.images?.[0] || product.image || "/default.png";

    // ✅ CREATE ORDER (FLIPKART STYLE)
    const newOrder = new Order({
      userId: req.session.user._id,

      name,
      email,
      phone,
      phone2,

      // ✅ OBJECT ADDRESS
      address: {
        fullName: name,
        mobile: phone,
        house,
        area,
        city,
        state,
        pincode,
        landmark
      },

      // ✅ ITEMS ARRAY
      items: [
        {
          productId: product._id,
          name: product.name,
          price: product.price,
          quantity: 1,
          size: product.category === "fashion" ? (size || "M") : null,
          image: productImage
        }
      ],

      // ✅ PRICE
      totalAmount: product.price,

      // ✅ PAYMENT
      paymentMethod: "COD",
      paymentStatus: "Pending",

      // ✅ TRACKING
      timeline: [{ status: "Placed" }]
    });

    await newOrder.save();

    // ✅ EMAIL (SAFE)
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

          <img src="${productImage}" width="200"/>

          <p>📦 Delivery within 4-5 days</p>
        `,
      });
    } catch (emailErr) {
      console.log("❌ Email failed:", emailErr.message);
    }

    // ✅ SUCCESS PAGE
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





// ✅ CREATE ORDER (ONLY ONE ROUTE!)
const razorpay = require("../config/razorpay"); // make sure this exists

router.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

   

    if (!amount) {
      return res.status(400).json({ error: "Amount missing" });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100, // ✅ convert to paise
      currency: "INR",
      receipt: "order_" + Date.now()
    });



    // ✅ IMPORTANT RESPONSE
    res.json({
      id: order.id,
      amount: order.amount
    });

  } catch (err) {
    console.log("ORDER ERROR:", err);
    res.status(500).json({ error: "Order failed" });
  }
});


// ✅ VERIFY PAYMENT
const axios = require("axios");


// ✅ VERIFY PAYMENT
router.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderData,
      productId,
      totalAmount
    } = req.body;

    if (!orderData || !productId) {
      return res.json({ success: false });
    }

    // ✅ SIGNATURE VERIFY
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (expectedSign !== razorpay_signature) {
      console.log("❌ Signature mismatch");
      return res.json({ success: false });
    }

    // ✅ PRODUCT FETCH
    const product = await Product.findById(productId);
    if (!product) {
      return res.json({ success: false });
    }

    const productImage =
      product.images?.[0] || product.image || "/default.png";

    // ✅ DELIVERY DATE
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 5);

    // ✅ CREATE ORDER
    const newOrder = new Order({
      userId: req.session.user._id,

      name: orderData.name,
      email: orderData.email,
      phone: orderData.phone,
      phone2: orderData.phone2,

      address: {
        fullName: orderData.name,
        mobile: orderData.phone,
        house: orderData.house,
        area: orderData.area,
        city: orderData.city,
        state: orderData.state,
        pincode: orderData.pincode
      },

      items: [
        {
          productId: product._id,
          name: product.name,
          price: product.price,
          quantity: 1,
          image: productImage
        }
      ],

      totalAmount: totalAmount,
      paymentMethod: "Online",
      paymentStatus: "Paid",

      status: "Placed",
      estimatedDelivery: deliveryDate,
      trackingId: "TRK" + Date.now(),

      statusHistory: [
        {
          status: "Placed",
          date: new Date()
        }
      ]
    });

    // ✅ SAVE FIRST
    await newOrder.save();

    // 🚚 DELHIVERY INTEGRATION (FIXED)
    try {
      const payload = {
        shipments: [
          {
            name: newOrder.name,
            add: newOrder.address.house,
            pin: newOrder.address.pincode,
            city: newOrder.address.city,
            state: newOrder.address.state,
            country: "India",
            phone: newOrder.phone,

            order: newOrder._id.toString(),
            payment_mode:
              newOrder.paymentMethod === "COD" ? "COD" : "Prepaid",
            total_amount: newOrder.totalAmount,

            products_desc: newOrder.items.map(i => i.name).join(", "),
            quantity: "1",

            shipment_length: "10",
            shipment_width: "10",
            shipment_height: "10",
            weight: "0.5"
          }
        ],
        pickup_location: {
          name: process.env.DELHIVERY_PICKUP_NAME
        }
      };

     const response = await axios.post(
  "https://staging-express.delhivery.com/api/cmu/create.json", // ✅ FIXED
  payload,
  {
    headers: {
      Authorization: `Token ${process.env.DELHIVERY_API_KEY}`,
      "Content-Type": "application/json"
    }
  }
);

      const waybill = response.data?.packages?.[0]?.waybill;

      if (waybill) {
        newOrder.trackingId = waybill;
        newOrder.courier = "Delhivery";
        await newOrder.save();

        console.log("✅ Delhivery AWB:", waybill);
      }
    } catch (err) {
      console.log("❌ Delhivery Error:", err.response?.data || err.message);
    }

    // ✅ FINAL RESPONSE
    res.json({ success: true });

  } catch (err) {
    console.log("VERIFY ERROR:", err);
    res.json({ success: false });
  }
});


router.get("/api/track/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order.trackingId) {
      return res.json({ success: false, message: "No tracking ID" });
    }

    const response = await axios.get(
      `https://track.delhivery.com/api/v1/packages/json/?waybill=${order.trackingId}`,
      {
        headers: {
          Authorization: `Token ${process.env.DELHIVERY_API_KEY}`
        }
      }
    );

res.json({
  success: true,
  data: response.data
});

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});

// admin page
// router.get("/admin/shipments", async (req, res) => {
//   const orders = await Order.find();
//   res.render("adminShipments", { orders });
// });

// update status
// router.post("/admin/update-status", async (req, res) => {
//   const { id, status } = req.body;

//   const order = await Order.findById(id);

//   order.status = status;

//   order.statusHistory.push({
//     status,
//     date: new Date()
//   });

//   await order.save();

//   res.redirect("/admin/shipments");
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

router.get("/track-order/:id", isLoggedIn, async (req, res) => {
  const order = await Order.findById(req.params.id);
  res.render("orderTracking", { order });
});

// Update Order Status
router.post("/admin/update-status/:id", async (req, res) => {
  const { status } = req.body;

  const order = await Order.findById(req.params.id);

  order.status = status;

  order.statusHistory.push({
    status,
    date: new Date()
  });

  await order.save();

  res.redirect("/admin");
});

function isAdmin(req, res, next) {
  if (!req.session.user || req.session.user.email !== "admin@gmail.com") {
    return res.send("Access Denied");
  }
  next();
}

// router.get("/admin/orders", isAdmin, async (req, res) => {
//   const orders = await Order.find()
//   .populate("items.productId", "name price images");
//   res.render("adminOrders", { orders });
// });

// router.get("/admin/products", async (req, res) => {
//   const products = await Product.find().sort({ createdAt: -1 });
//   res.render("adminProducts", { products });
// });

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

    let {
      name,
      price,
      description,
      category,
      mainCategory,
      subCategory,
      discountType,
      discountValue
    } = req.body;

    // ✅ CONVERT TO NUMBER
    price = Number(price);
    discountValue = Number(discountValue) || 0;

    // =========================
    // ✅ IMAGES HANDLE
    // =========================

    let images = [];

    // OLD IMAGES (jo delete nahi hui)
    if (req.body.existingImages) {
      if (Array.isArray(req.body.existingImages)) {
        images = req.body.existingImages;
      } else {
        images = [req.body.existingImages];
      }
    }

    // NEW IMAGES ADD
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => file.path);
      images = images.concat(newImages);
    }

    // =========================
    // ✅ HIGHLIGHTS ARRAY
    // =========================

    let highlights = [];
    if (req.body.highlights) {
      if (Array.isArray(req.body.highlights)) {
        highlights = req.body.highlights.filter(h => h.trim() !== "");
      } else {
        highlights = [req.body.highlights];
      }
    }

    // =========================
    // ✅ SPECIFICATIONS OBJECT
    // =========================

    let specifications = {};

    if (req.body.specKey && req.body.specValue) {
      const keys = Array.isArray(req.body.specKey) ? req.body.specKey : [req.body.specKey];
      const values = Array.isArray(req.body.specValue) ? req.body.specValue : [req.body.specValue];

      keys.forEach((key, index) => {
        if (key && values[index]) {
          specifications[key] = values[index];
        }
      });
    }

    // =========================
    // ✅ DISCOUNT LOGIC
    // =========================

    let finalPrice = price;

    if (discountType === "percentage") {
      finalPrice = price - (price * discountValue / 100);
    } else if (discountType === "flat") {
      finalPrice = price - discountValue;
    }

    if (finalPrice < 0) finalPrice = 0;

    // =========================
    // ✅ UPDATE PRODUCT
    // =========================

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
      images,
      highlights,
      specifications
    });

    res.redirect("/admin");

  } catch (err) {
    console.log("Edit POST Error:", err);
    res.send("Update failed");
  }
});

router.get("/admin/delete-product/:id", async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.redirect('/admin'); // ✅ already correct
});

// router.get("/admin/dashboard", async (req, res) => {

//   const totalProducts = await Product.countDocuments();
//   const totalOrders = await Order.countDocuments();

//   const orders = await Order.find();

//  let revenue = 0;

// orders.forEach(o => {
//   if (o.payment) {
//     const match = o.payment.match(/\d+/);
//     if (match) {
//       revenue += o.totalAmount || 0;
//     }
//   }
// });

  
//   res.render("adminDashboard", {
//     totalProducts,
//     totalOrders,
//     revenue
//   });
// });

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

  const orders = await Order.find()
    .populate("items.productId", "name price images");

  const totalProducts = await Product.countDocuments();
  const totalOrders = await Order.countDocuments();

  let revenue = 0;
  orders.forEach(o => {
    revenue += o.totalAmount || 0;
  });

  res.render("admin", {   // ✅ CHANGE HERE
    products,
    orders,
    totalProducts,
    totalOrders,
    revenue
  });
});


// routes/payment.js






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