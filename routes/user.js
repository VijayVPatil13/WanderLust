const express = require('express');
const router = express.Router({mergeParams: true});
const wrapAsync = require('../utils/wrapAsync.js');
const {saveRedirectUrl} = require('../middleware.js');
const userController = require('../controllers/users.js');

router.get("/signup", userController.renderSignup);

router.post("/signup", wrapAsync(userController.signup));

router.get("/login", userController.renderLogin);

router.post("/login", saveRedirectUrl, userController.login);

router.get("/logout", userController.logout);

module.exports = router;