const express = require('express');
const { getAuthorizationUrl, authCallbackMiddleware, authRefreshMiddleware, getUserProfile } = require('../services/aps/auth.js');
const { APS_CLIENT_ID } = require('../config.js')

let router = express.Router();

router.get('/login', function (req, res) {
    res.redirect(getAuthorizationUrl());
});

router.get('/logout', function (req, res) {
    req.session = null;
    res.redirect('/');
});

router.get('/callback', authCallbackMiddleware, function (req, res) {
    res.redirect('/');
});

router.get('/token', authRefreshMiddleware, function (req, res) {
    res.json(req.publicOAuthToken);
});

router.get('/profile', authRefreshMiddleware, async function (req, res, next) {
    try {
        const profile = await getUserProfile(req.internalOAuthToken);
        res.json({ 
            name: `${profile.name}`,
            picture: profile.picture
        });
    } catch (err) {
        next(err);
    }
});

router.get('/clientid', function (req, res) {
    res.json({
        id: APS_CLIENT_ID
    });
});

module.exports = router;
