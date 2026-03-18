const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: Number,
    phone2: Number,
    address: String,
    payment:String,
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
    }
    
})

module.exports = mongoose.model("Order",orderSchema)