const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema({
    title: String,
    description: String,
    price: {
        type: Number,
        required: true
    },
    location: String,
    country: String,
    image: {
        type: String,
        default: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=60"
    }
}, { timestamps: true });

const Listing = mongoose.model("Listing", listingSchema);

module.exports = Listing;