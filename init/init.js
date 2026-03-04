const mongoose = require("mongoose");
const Listing = require("../models/listing");
const data = require("./data").data;

// Connect to MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/wanderlust")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

async function initializeDb() {
  try {
    // Delete existing listings
    await Listing.deleteMany({});
    console.log("Old data cleared");

    //Add owner to each listing
    let sampleData = data.map((obj) => ({...obj, owner: '69a590acc82ace4ceeaa3248'}));
    
    // Insert sample data
    await Listing.insertMany(sampleData);
    console.log("Database initialized with sample data");

    mongoose.connection.close();
  } catch (err) {
    console.error("Error initializing DB:", err);
  }
}

initializeDb();