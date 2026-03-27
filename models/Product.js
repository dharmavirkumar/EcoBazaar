const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  description: String,

  // ❌ OLD (optional rakh sakte ho)
  category: String,

  // ✅ NEW (IMPORTANT FOR MENU)
  mainCategory: String,   // Top Wear, Bottom Wear
  subCategory: String,    // Shirts, Jeans

  // ✅ MULTIPLE IMAGES
  images: [String],

  // ✅ DISCOUNT SYSTEM
  discountType: {
    type: String,
    enum: ["none", "percentage", "flat"],
    default: "none"
  },

  discountValue: {
    type: Number,
    default: 0
  },

  finalPrice: Number

}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);