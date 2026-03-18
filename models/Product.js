const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({

name:String,
price:Number,
description:String,
image:String,

category:{
type:String,
default:"general"
}

});

module.exports = mongoose.model("Product",productSchema);