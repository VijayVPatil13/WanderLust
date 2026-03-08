const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const Review = require("./review");

const listingSchema = new Schema({
    title: String,
    description: String,
    price: {
        type: Number,
        required: true
    },
    location: String,
    country: String,
    image: {
        url: String,
        filename: String
    },
    reviews: [
        {
            type: Schema.Types.ObjectId,
            ref: 'Review'
        }
    ],
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    }
});

listingSchema.post("findOneAndDelete", async(listing) => {
    if(listing) {
        await Review.deleteMany({_id : {$in : listing.reviews}});
    }
});

const Listing = mongoose.model("Listing", listingSchema);

module.exports = Listing;