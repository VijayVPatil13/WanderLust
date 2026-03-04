const express = require('express');
const mongoose = require("mongoose");
const app = express();

const listingRouter = require('./routes/listing.js');
const reviewRouter = require('./routes/review.js');
const userRouter = require('./routes/user.js');

const path = require('path');
const methodOverride = require('method-override');
const ejsMate = require('ejs-mate');

const session = require('express-session');

const User = require('./models/user.js');
const passport = require('passport');
const LocalStratergy = require('passport-local');

const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";
mongoose.connect(MONGO_URL)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.error("MongoDB Error:", err));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

const sessionOptions = {
  secret: "mysupersecretcode",
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true
  }
};

app.use(session(sessionOptions));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStratergy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  res.locals.success = req.session.success;
  res.locals.error = req.session.error;
  res.locals.currUser = req.user;
  delete req.session.success;
  delete req.session.error;
  next();
});

app.use((req, res, next) => {
  console.log("Incoming:", req.method, req.url);
  next();
});

app.get('/', (req, res) => {
  res.redirect("/listings");
});

app.use("/listings/:id/reviews", reviewRouter);
app.use("/listings", listingRouter);
app.use("/", userRouter);

app.use((req, res) => {
  res.status(404).render("error.ejs", {
    err: { message: "Page Not Found" },
    status: 404
  });
});

app.use((err, req, res, next) => {
  if (err.name === "UserExistsError") {
    req.session.error = "Username already exists.";
    return res.redirect("/signup");
  }
  const status = err.status || 500;
  const message = err.message || "Something went wrong";
  return res.status(status).render("error.ejs", {
    err: { message },
    status
  });
});

app.listen(8080, () => {
  console.log("Server is running on http://localhost:8080");
});