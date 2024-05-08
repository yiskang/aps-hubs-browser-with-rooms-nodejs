const { HubsApi, ProjectsApi, FoldersApi, ItemsApi, VersionsApi, DerivativesApi } = require('forge-apis');

async function getHubs(oauthClient, credentials) {
    const hubs = new HubsApi();
    const data = await hubs.getHubs({ filterExtensionType: ['hubs:autodesk.bim360:Account'] }, oauthClient, credentials);
    return data.body.data.map((hub) => {
        let hubType;
        switch (hub.attributes.extension.type) {
            case 'hubs:autodesk.core:Hub':
                hubType = 'hubs';
                break;
            case 'hubs:autodesk.a360:PersonalHub':
                hubType = 'personalHub';
                break;
            case 'hubs:autodesk.bim360:Account':
                hubType = 'bim360Hubs';
                break;
        }
        return createTreeNode(
            hub.links.self.href,
            hub.attributes.name,
            hubType,
            true
        );
    });
}

async function getProjects(hubId, oauthClient, credentials) {
    const projects = new ProjectsApi();
    const data = await projects.getHubProjects(hubId, {}, oauthClient, credentials);
    return data.body.data.map((project) => {
        let projectType = 'projects';
        switch (project.attributes.extension.type) {
            case 'projects:autodesk.core:Project':
                projectType = 'a360projects';
                break;
            case 'projects:autodesk.bim360:Project':
                projectType = 'bim360projects';
                break;
        }
        return createTreeNode(
            project.links.self.href,
            project.attributes.name,
            projectType,
            true
        );
    });
}

async function getFolders(hubId, projectId, oauthClient, credentials) {
    const projects = new ProjectsApi();
    const folders = await projects.getProjectTopFolders(hubId, projectId, oauthClient, credentials);
    return folders.body.data.map((item) => {
        return createTreeNode(
            item.links.self.href,
            item.attributes.displayName == null ? item.attributes.name : item.attributes.displayName,
            item.type,
            true
        );
    });
}

async function getFolderContents(projectId, folderId, oauthClient, credentials) {
    const folders = new FoldersApi();
    const contents = await folders.getFolderContents(projectId, folderId, {}, oauthClient, credentials);
    const treeNodes = contents.body.data.map((item) => {
        var name = (item.attributes.name == null ? item.attributes.displayName : item.attributes.name);
        if (name !== '') {
            return createTreeNode(
                item.links.self.href,
                name,
                item.type,
                true
            );
        } else {
            return null;
        }
    });
    return treeNodes.filter(node => node !== null);
}

async function getFolderParent(projectId, folderId, oauthClient, credentials) {
    try {
        const folders = new FoldersApi();
        const contents = await folders.getFolderParent(projectId, folderId, oauthClient, credentials);
        const parentFolder = contents.body.data;
        const node = createTreeNode(
            parentFolder.links.self.href,
            (parentFolder.attributes.name == null ? parentFolder.attributes.displayName : parentFolder.attributes.name),
            parentFolder.type,
            true
        );
        return node;
    } catch (ex) {
        throw ex;
    }
}

async function getItemFolderParent(projectId, itemId, oauthClient, credentials) {
    const items = new ItemsApi();
    const contents = await items.getItemParentFolder(projectId, itemId, oauthClient, credentials);
    const parentFolder = contents.body.data;
    const node = createTreeNode(
        parentFolder.links.self.href,
        (parentFolder.attributes.name == null ? parentFolder.attributes.displayName : parentFolder.attributes.name),
        parentFolder.type,
        true
    );
    return node;
}

async function getVersions(projectId, itemId, oauthClient, credentials) {
    const items = new ItemsApi();
    const versions = await items.getItemVersions(projectId, itemId, {}, oauthClient, credentials);

    const version_promises = versions.body.data.map(async (version) => {
        const dateFormated = new Date(version.attributes.lastModifiedTime).toLocaleString();
        const versionst = version.id.match(/^(.*)\?version=(\d+)$/)[2];
        if (version.attributes.extension.data && version.attributes.extension.data.viewableGuid) {

            //this might be the documents in BIM 360 Plan folder. It is view (derivative)already.
            const viewableGuid = version.attributes.extension.data.viewableGuid
            //NOTE: version.id is the urn of view version, instead of the [seed file version urn]
            //tricky to find [seed file version urn]
            //var viewerUrn = Buffer.from(params[0]).toString('base64') + '_' + Buffer.from(params[1]).toString('base64')

            const seedVersionUrn = await getVersionRef(projectId, version.id, oauthClient, credentials)
            const viewerUrn = seedVersionUrn ? Buffer.from(seedVersionUrn).toString('base64').replace('/', '_').trim('=').split('=').join('') : null

            const seedVersionStorage = await getVersionRefStorage(projectId, version.id, oauthClient, credentials);
            // let's return for the jsTree with a special id:
            // itemUrn|versionUrn|viewableId
            // itemUrn: used as target_urn to get document issues
            // versionUrn: used to launch the Viewer
            // viewableId: which viewable should be loaded on the Viewer
            // this information will be extracted when the user click on the tree node
            return createTreeNode(
                viewerUrn + '|' + viewableGuid,
                decodeURI('v' + versionst + ': ' + dateFormated + ' by ' + version.attributes.lastModifiedUserName),
                (viewerUrn != null ? 'versions' : 'unsupported'),
                false,
                {
                    projectId,
                    itemId,
                    versionId: version.id,
                    seedVersionId: seedVersionUrn
                }
            );
        } else {
            //non-BIM 360 Plan folder (also Autodesk 360, Fusion 360 etc). will need to dump views in the next iteration 
            const viewerUrn = (version.relationships != null && version.relationships.derivatives != null ? version.relationships.derivatives.data.id : null);
            return createTreeNode(
                viewerUrn,
                decodeURI('v' + versionst + ': ' + dateFormated + ' by ' + version.attributes.lastModifiedUserName),
                viewerUrn ? 'versions' : 'unsupported',
                true,
                {
                    projectId,
                    itemId,
                    versionId: version.id
                }
            );
        }
    })
    const versions_json = await Promise.all(version_promises);
    return versions_json;
}

async function getVersionRefStorage(projectId, viewUrnId, oauthClient, credentials) {
    const versionApi = new VersionsApi()
    const relationshipRefs = await versionApi.getVersionRelationshipsRefs(projectId, viewUrnId, {}, oauthClient, credentials)

    if (relationshipRefs.body && relationshipRefs.body.included && relationshipRefs.body.included.length > 0) {
        //find file of the reference
        const ref = relationshipRefs.body.included.find(d => d &&
            d.type == 'versions' &&
            d.attributes.extension.type == 'versions:autodesk.bim360:File')

        if (ref) {
            return ref.relationships.storage.data.id;
        } else {
            return null;
        }
    }

    return null;
}

// get references of this version urn,e.g. views of seed file
async function getVersionRef(projectId, viewUrnId, oauthClient, credentials) {
    // Documents in BIM 360 Folder will go to this branch
    const relationshipRefs = await getVersionRefDetails(projectId, viewUrnId, oauthClient, credentials)

    if (relationshipRefs.data && relationshipRefs.data.length > 0) {
        //find meta of the reference
        const ref = relationshipRefs.body.data.find(d => d.meta &&
            d.meta.fromType == 'versions' &&
            d.meta.toType == 'versions')
        if (ref) {
            if (ref.meta.extension.type == 'derived:autodesk.bim360:CopyDocument') {
                //this is a copy document, ref.id is the view urn, instead of version urn
                //recurse until find the source version urn
                const sourceViewId = ref.id
                return await getVersionRef(projectId, sourceViewId, oauthClient, credentials)
            } else if (ref.meta.extension.type == 'derived:autodesk.bim360:FileToDocument') {
                //this is the original documents, when source model version is extracted in BIM 360 Plan folder
                return ref.id
            } else {
                return null
            }
        } else {
            return null
        }
    } else {
        return null
    }
}

// get references of this version urn,e.g. views of seed file
async function getVersionRefDetails(projectId, viewUrnId, oauthClient, credentials) {
    // Documents in BIM 360 Folder will go to this branch
    const versionApi = new VersionsApi()
    const relationshipRefs = await versionApi.getVersionRelationshipsRefs(projectId, viewUrnId, {}, oauthClient, credentials)

    return relationshipRefs.body;
}

async function getVersionLinks(projectId, viewUrnId, oauthClient, credentials) {
    const relationshipRefs = await getVersionRefDetails(projectId, viewUrnId, oauthClient, credentials);

    const { data, included } = relationshipRefs;
    let xrefData = [];

    for (let xrefIdx in data) {
        let xref = data[xrefIdx];
        const { toId, fromId, refType, direction } = xref.meta;

        if (refType !== 'xrefs') continue;

        if (fromId == viewUrnId) {
            if (!xrefData.some(x => x.versionId == toId)) {
                xrefData.push({
                    versionId: toId,
                    type: (direction == 'to') ? 'host' : 'link'
                });
            }
        } else {
            if (!xrefData.some(x => x.versionId == fromId)) {
                xrefData.push({
                    versionId: fromId,
                    type: (direction == 'to') ? 'host' : 'link'
                });
            }
        }
    }

    let includedVersions = included.filter(d => d.type == 'versions');

    for (let versionIdx in includedVersions) {
        let includedVersion = includedVersions[versionIdx];
        let xref = xrefData.find(x => x.versionId == includedVersion.id);

        if (!xref) continue;

        xref.derivativeId = includedVersion.relationships.derivatives?.data.id;
    }

    let hostVersion = includedVersions.find(v => v.id == viewUrnId);

    return {
        current: {
            versionId: viewUrnId,
            derivativeId: hostVersion.relationships.derivatives?.data.id
        },
        xrefs: xrefData
    };
}

async function getVersionViews(urn, oauthClient, credentials) {

    const region = Buffer.from(urn, 'base64').toString('ascii').indexOf('emea') > -1 ? 'EU' : 'US';
    const derivativesApi = new DerivativesApi(null, region);

    //get manifest of this model version 
    const manifest = await derivativesApi.getManifest(urn, {}, oauthClient, credentials)
    //find the derivative of svf
    const geo_derivatives = manifest.body.derivatives.find(d => d.outputType == 'svf' || d.outputType == 'svf2')

    //get metadata of this model version
    const metadata = await derivativesApi.getMetadata(urn, {}, oauthClient, credentials);

    //dump each metadata
    const view_promises = metadata.body.data.metadata.map(async (view) => {

        //view.guid is the metadata id, now find the corresponding real vieweable id 

        //search which [geometry derivative] whose [graphics] child has the same metadata id 
        const metadata_graphics = geo_derivatives.children.find(d => d.type == 'geometry' &&
            d.children.find(r => r.guid == view.guid) != null)

        return createTreeNode(
            urn + '|' + (metadata_graphics ? metadata_graphics.guid : 'none'),
            view.name,
            metadata_graphics ? 'views' : 'unsupported',
            false
        );
    });

    //promise the iteration
    const views_json = await Promise.all(view_promises);
    return views_json;
}

// Format data for tree
function createTreeNode(_id, _text, _type, _children, _data) {
    return { id: _id, text: _text, type: _type, children: _children, data: _data };
}

module.exports = {
    getHubs,
    getProjects,
    getFolders,
    getFolderContents,
    getFolderParent,
    getItemFolderParent,
    getVersions,
    getVersionViews,
    getVersionLinks
};
