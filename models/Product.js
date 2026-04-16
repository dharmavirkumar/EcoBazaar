const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  description: String,

  category: String,

  mainCategory: String,
  subCategory: String,

  images: [String],

  discountType: {
    type: String,
    enum: ["none", "percentage", "flat"],
    default: "none"
  },

  discountValue: {
    type: Number,
    default: 0
  },

  finalPrice: Number,

 // 🔥 NEW PRO FIELDS
  highlights: [String],   // bullet points
  description: String,   // full description (HTML allowed)
  specifications: {
  type: Object
},

paymentOptions: {
  cod: { type: Boolean, default: true },
  online: { type: Boolean, default: true }
},
  // 🔥 NEW (IMPORTANT)
  sizes: {
  type: [String],
  default: []
}
}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);