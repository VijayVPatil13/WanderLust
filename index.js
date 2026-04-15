if (process.env.NODE_ENV != "production") {
  require('dotenv').config();
}

const express = require('express');
const mongoose = require("mongoose");
const app = express();
const PORT = process.env.PORT || 8080;

const listingRouter = require('./routes/listing.js');
const reviewRouter = require('./routes/review.js');
const userRouter = require('./routes/user.js');
const bookingRouter = require('./routes/booking.js');
const bookingApiRouter = require('./routes/bookingApi.js');
const webhookRouter = require('./routes/webhook.js');
const { startBookingExpiryJob } = require('./utils/bookingExpiryJob.js');

const path = require('path');
const methodOverride = require('method-override');
const ejsMate = require('ejs-mate');

const session = require('express-session');
const MongoStore = require('connect-mongo');

const User = require('./models/user.js');
const passport = require('passport');
const LocalStratergy = require('passport-local');

const dbUrl = process.env.ATLASDB_URL;
mongoose.connect(dbUrl)
  .then(() => {
    console.log("MongoDB Atlas connected");
    startBookingExpiryJob();
  })
  .catch(err => console.error("MongoDB Error:", err));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json({
  verify: (req, res, buf) => {
    if (buf && buf.length) {
      req.rawBody = buf;
    }
  }
}));
app.use(methodOverride('_method'));

app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

const store = MongoStore.create({
  mongoUrl: dbUrl,
  crypto: {
    secret: process.env.SECRET,
  },
  touchAfter: 24 * 3600
});

store.on("error", (err) => {
  console.log("Error in Mongo Session", err);
});

const sessionOptions = {
  store,
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production"
  }
};

app.use(session(sessionOptions));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStratergy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  if (req.method === "HEAD") {
    return res.status(200).end();
  }
  next();
});

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
  return res.redirect("/listings");
});

app.use("/listings/:id/reviews", reviewRouter);
app.use("/listings", listingRouter);
app.use("/bookings", bookingRouter);
app.use("/api/bookings", bookingApiRouter);
app.use("/api/webhooks", webhookRouter);
app.use("/", userRouter);

app.use((req, res) => {
  res.status(404).render("error.ejs", {
    err: { message: "Page Not Found" },
    status: 404
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err); // 🔥 CRITICAL FIX
  }

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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
