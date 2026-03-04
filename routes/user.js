const express = require('express');
const router = express.Router({mergeParams: true});
const User = require('../models/user.js');
const wrapAsync = require('../utils/wrapAsync.js');
const passport = require('passport');
const {saveRedirectUrl} = require('../middleware.js');

router.get("/signup", (req, res) => {
    res.render("users/signup.ejs");
});

router.post("/signup", wrapAsync(async (req, res, next) => {
    let { username, email, password } = req.body;
    const user = new User({ email, username });
    const registeredUser = await User.register(user, password);
    req.logIn(registeredUser, (err) =>{
      if(err) {
        return next(err);
      }
      req.session.success = "Welcome to WanderLust";
      return res.redirect("/listings");
    });
}));

router.get("/login", (req, res) => {
    res.render("users/login.ejs");
});

router.post("/login", saveRedirectUrl, (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.session.error = "Invalid username or password.";
      return res.redirect("/login");
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      req.session.success = "Login Successful!";
      let redirectUrl = res.locals.redirectUrl || "/listings";
      return res.redirect(redirectUrl);
    });
  })(req, res, next);
});

router.get("/logout", (req, res, next) => {
  req.logOut((err) => {
    if(err) return next(err);
    req.session.success = "You are logged out!";
    res.redirect("/listings");
  });
});

module.exports = router;