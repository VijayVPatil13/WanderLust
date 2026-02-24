const express = require('express');
const Listing = require('./models/listing'); 
require('./models/db'); 

const path = require('path');
const methodOverride = require('method-override');
const ejsMate = require('ejs-mate');

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));


// Redirect root
app.get('/', (req, res) => {
  res.redirect("/listings");
});


// Create form
app.get("/listings/new", (req, res) => {
  res.render("listings/new.ejs");
});


// Create listing
app.post("/listings", async (req, res) => {
  const listing = new Listing(req.body.listing);
  await listing.save();
  res.redirect("/listings");
});


// Edit form
app.get("/listings/:id/edit", async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  res.render("listings/edit.ejs", { listing });
});


// Update listing
app.put("/listings/:id", async (req, res) => {
  await Listing.findByIdAndUpdate(
    req.params.id,
    req.body.listing,
    { new: true, runValidators: true }
  );
  res.redirect(`/listings/${req.params.id}`);
});


// Delete listing
app.delete("/listings/:id", async (req, res) => {
  await Listing.findByIdAndDelete(req.params.id);
  res.redirect("/listings");
});


// Show one listing
app.get("/listings/:id", async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  res.render("listings/show.ejs", { listing });
});


// Show all listings
app.get("/listings", async (req, res) => {
  const listings = await Listing.find({});
  res.render("listings/index.ejs", { listings });
});


app.listen(8080, () => {
  console.log("Server is running on http://localhost:8080");
});