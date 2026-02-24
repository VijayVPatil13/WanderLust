const mongoose = require("mongoose");

const MONGO_URL = "mongodb://127.0.0.1:27017/listingsDB";

mongoose.connect(MONGO_URL)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.error("MongoDB Error:", err));

module.exports = mongoose;