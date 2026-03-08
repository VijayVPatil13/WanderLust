const User = require('../models/user.js');
const passport = require('passport');

module.exports.renderSignup = (req, res) => {
    res.render("users/signup.ejs");
}

module.exports.signup = async (req, res, next) => {
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
}

module.exports.renderLogin = (req, res) => {
    res.render("users/login.ejs");
}

module.exports.login = (req, res, next) => {
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
}

module.exports.logout = (req, res, next) => {
  req.logOut((err) => {
    if(err) return next(err);
    req.session.success = "You are logged out!";
    res.redirect("/listings");
  });
}