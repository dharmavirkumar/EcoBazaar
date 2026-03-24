const mongoose = require("mongoose");
const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  description: String,
  category: String,
  image: String,
  // ✅ NEW FIELDS
  discount: {
    type: Number, // percentage
    default: 0
  },
  finalPrice: {
    type: Number
  }
}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);