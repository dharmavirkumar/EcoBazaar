// const mongoose = require("mongoose");
// const productSchema = new mongoose.Schema({
//   name: String,
//   price: Number,
//   description: String,
//   category: String,
//   image: String,
//   // ✅ NEW FIELDS
//   discount: {
//     type: Number, // percentage
//     default: 0
//   },
//   finalPrice: {
//     type: Number
//   }
// }, { timestamps: true });

// module.exports = mongoose.model("Product", productSchema);


const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  description: String,
  category: String,

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