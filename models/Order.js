const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  address: String,
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product"
  },
  

  // ✅ ADD THIS
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  size: String,

  payment: String,

  // ✅ Order Status
  status: {
    type: String,
    enum: ["Placed", "Shipped", "Out for Delivery", "Delivered", "Cancelled"],
    default: "Placed"
  }

}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);