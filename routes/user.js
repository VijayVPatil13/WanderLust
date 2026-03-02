const express = require('express');
const router = express.Router({mergeParams: true});
const User = require('../models/user.js');
const wrapAsync = require('../utils/wrapAsync.js');
const passport = require('passport');

router.get("/signup", (req, res) => {
    res.render("users/signup.ejs");
});

router.post("/signup", wrapAsync(async (req, res) => {
    let { username, email, password } = req.body;
    const user = new User({ email, username });
    await User.register(user, password);
    req.session.success = "Welcome to WanderLust";
    return res.redirect("/listings");
}));

router.get("/login", (req, res) => {
    res.render("users/login.ejs");
});

router.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.session.error = "Invalid username or password.";
      return res.redirect("/login");
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      req.session.success = "Login Successful!";
      return res.redirect("/listings");
    });
  })(req, res, next);
});

module.exports = router;