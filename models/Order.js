const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({

  // 👤 USER INFO
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  name: String,
  email: String,
  phone: String,
  phone2: String,

  // 📍 ADDRESS (FLIPKART STYLE)
  address: {
    fullName: String,
    mobile: String,
    house: String,
    area: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String,
    type: {
      type: String,
      enum: ["Home", "Work"],
      default: "Home"
    }
  },

  // 🛍️ PRODUCTS (MULTIPLE ITEMS SUPPORT)
  items: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
      },
      name: String,
      price: Number,
      quantity: {
        type: Number,
        default: 1
      },
      size: String,
      image: String
    }
  ],

  // 💰 PRICE DETAILS (IMPORTANT)
  totalAmount: Number,
  deliveryCharge: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },

  // 💳 PAYMENT
 paymentMethod: {
  type: String,
  enum: ["COD", "Online"], // ✅ ADD THIS
  
},

  paymentStatus: {
    type: String,
    enum: ["Pending", "Paid", "Failed"],
    default: "Pending"
  },

  razorpay_order_id: String,
  razorpay_payment_id: String,

  // 📦 ORDER STATUS TRACKING
  status: {
    type: String,
    enum: [
      "Placed",
      "Confirmed",
      "Shipped",
      "Out for Delivery",
      "Delivered",
      "Cancelled"
    ],
    default: "Placed"
  },
  estimatedDelivery: Date,
trackingId: String,
courier: String,
statusHistory: [
  {
    status: String,
    date: Date
  }
],
returnStatus: {
  type: String,
  default: "None" // None | Requested | Approved | Rejected
},

  // 🕒 TRACKING TIMELINE
  timeline: [
    {
      status: String,
      date: {
        type: Date,
        default: Date.now
      }
    }
  ]

}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);