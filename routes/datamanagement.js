const express = require('express');
const { authRefreshMiddleware, internalAuthClient } = require('../services/aps/auth.js');
const {
    getHubs,
    getProjects,
    getFolders,
    getFolderContents,
    getFolderParent,
    getItemFolderParent,
    getVersions,
    getVersionViews,
    getVersionLinks
} = require('../services/aps/datamanagement.js');

let router = express.Router();

router.use(authRefreshMiddleware);

router.get('/', async (req, res) => {
    // The id querystring parameter contains what was selected on the UI tree, make sure it's valid
    const href = decodeURIComponent(req.query.id);
    if (href === '') {
        res.status(500).end();
        return;
    }

    let internalToken = req.internalOAuthToken;
    let results = null;

    if (href === '#') {
        // If href is '#', it's the root tree node
        results = await getHubs(internalAuthClient, internalToken);
    } else {
        // Otherwise let's break it by '/'
        const params = href.split('/');

        let resourceName = ''
        let resourceId = ''
        if (params.length > 1) {
            resourceName = params[params.length - 2];
            resourceId = params[params.length - 1];
        } else {
            resourceName = 'views'
        }

        switch (resourceName) {
            case 'hubs':
                results = await getProjects(resourceId, internalAuthClient, internalToken);
                break;
            case 'projects':
                // For a project, first we need the top/root folder
                const hubId = params[params.length - 3];
                results = await getFolders(hubId, resourceId/*project_id*/, internalAuthClient, internalToken);
                break;
            case 'folders':
                {
                    const projectId = params[params.length - 3];
                    results = await getFolderContents(projectId, resourceId/*folder_id*/, internalAuthClient, internalToken);
                    break;
                }
            case 'items': //this can be an item in non-Plan folder and can also be a bim360 document in Plan folder
                {
                    const projectId = params[params.length - 3];
                    results = await getVersions(projectId, resourceId/*item_id*/, internalAuthClient, internalToken);
                    break;
                }
            case 'views':
                {
                    results = await getVersionViews(href,/*urn_id*/ internalAuthClient, internalToken);
                    break;
                }
        }
    }

    res.json(results);
});

router.get('/projects/:projectId/folders/:folderId/parent', async (req, res, next) => {
    try {
        // Get the access token
        let internalToken = req.internalOAuthToken;

        let results = await getFolderParent(req.params.projectId, req.params.folderId, internalAuthClient, internalToken);
        res.json(results);
    } catch (err) {
        next(err);
    }
});

router.get('/projects/:projectId/items/:itemId/parent', async (req, res, next) => {
    try {
        // Get the access token
        let internalToken = req.internalOAuthToken;

        let results = await getItemFolderParent(req.params.projectId, req.params.itemId, internalAuthClient, internalToken);
        res.json(results);
    } catch (err) {
        next(err);
    }
});

router.get('/projects/:projectId/versions/:version_id/links', async (req, res, next) => {
    try {
        // Get the access token
        let internalToken = req.internalOAuthToken;

        const versionId = decodeURIComponent(req.params.version_id);
        const projectId = req.params.projectId;

        const results = await getVersionLinks(projectId, versionId, internalAuthClient, internalToken);

        res.json(results);
    } catch (err) {
        next(err);
    }
});

module.exports = router;