/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Developer Advocacy and Support
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

var viewer = null;

async function loadViewAsync(viewer, urn, viewableId, options) {
  return new Promise((resolve, reject) => {
    async function onDocumentLoadSuccess(doc) {
      //await doc.downloadAecModelData();

      options = options || {};

      let viewable = (viewableId ? doc.getRoot().findByGuid(viewableId) : doc.getRoot().getDefaultGeometry());
      let model = await viewer.loadDocumentNode(doc, viewable, options);

      await viewer.waitForLoadDone();
      resolve(model);
    }

    function onDocumentLoadFailure() {
      reject(new Error('Failed fetching Forge manifest'));
    }

    Autodesk.Viewing.Document.load(urn, onDocumentLoadSuccess, onDocumentLoadFailure);
  });
}

async function getRoomDbIdsAsync(model, roomCategoryName = 'Revit Rooms') {
  return new Promise((resolve, reject) => {
    model.search(
      `${roomCategoryName}`,
      (dbIds) => resolve(dbIds),
      (error) => reject(error),
      ['Category'],
      { searchHidden: true }
    );
  });
};

async function getBulkPropertiesAsync(model, dbIds) {
  return new Promise((resolve, reject) => {
    model.getBulkProperties2(
      dbIds,
      {
        ignoreHidden: false,
        propFilter: ['viewable_in', 'externalId'],
        needsExternalId: true,
      },
      (result) => resolve(result),
      (error) => reject(error),
    );
  });
}

async function getExternalIdMappingAsync(model) {
  return new Promise((resolve, reject) => {
    model.getExternalIdMapping(
      (result) => resolve(result),
      (error) => reject(error),
    );
  });
}

async function getRoomViewableInfoAsync(model) {
  const doc = model.getDocumentNode().getDocument();
  let roomDbIds = await getRoomDbIdsAsync(model);
  if (roomDbIds.length <= 0)
    roomDbIds = await getRoomDbIdsAsync(model, 'Revit Ambientes');

  // let externalIdMap = await getExternalIdMappingAsync(model);
  // let externalIds = Object.keys(externalIdMap);
  // let dbIds = Object.values(externalIdMap);

  // let nonLinkedRoomDbIds = [];
  // for (let i = 0; i < roomDbIds.length; i++) {
  //   let dbId = roomDbIds[i];
  //   let idx = dbIds.indexOf(dbId);
  //   if (idx <= -1) continue;

  //   let externalId = externalIds[idx];
  //   if (externalIds.includes(`/${externalId}`)) continue;

  //   nonLinkedRoomDbIds.push(dbId);
  // }

  let result = await getBulkPropertiesAsync(model, roomDbIds);

  let roomInfoMap = {};
  result.forEach(r => {
    let roomDbId = r.dbId;
    let viewableIds = r.properties.map(prop => prop.displayValue);

    for (let i = 0; i < viewableIds.length; i++) {
      const viewableId = viewableIds[i];
      const bubble = doc.getRoot().findByGuid(viewableId);

      if (bubble.is2D())
        continue;

      if (roomInfoMap[viewableId]) {
        roomInfoMap[viewableId].dbIds.push(roomDbId);
      } else {
        roomInfoMap[viewableId] = {
          bubble,
          dbIds: [roomDbId]
        };
      }
    }
  });

  return roomInfoMap;
}

async function loadRoomsAsync(viewer, urn, options) {
  let mainModel = await loadViewAsync(viewer, urn, null, { keepCurrentModels: true, loadAsHidden: true, preserveView: true });

  const bubble = mainModel.getDocumentNode();
  const doc = mainModel.getDocumentNode().getDocument();
  let roomInfo = await getRoomViewableInfoAsync(mainModel);
  if (!roomInfo) return Promise.resolve();

  let data = Object.values(roomInfo);

  viewer.unloadDocumentNode(bubble);

  for (let i = 0; i < data.length; i++) {
    await viewer.loadDocumentNode(
      doc,
      data[i].bubble,
      {
        ids: data[i].dbIds,
        modelNameOverride: `Room Phase \`${data[i].bubble.name()}\` of ${doc.getRoot().getModelName()}`,
        keepCurrentModels: true,
        preserveView: true,
        globalOffset: new THREE.Vector3(),
        placementTransform: viewer.model?.getModelToViewerTransform()
      }
    );

    await viewer.waitForLoadDone();
  }

  return Promise.resolve();
}

const loadRoomsFromXrefsAsync = async (data) => {
  // // Load Rooms from Host
  // await loadRoomsAsync(viewer, 'urn:' + data.current.derivativeId);

  if (!Array.isArray(data.xrefs))
    throw new Error('Invalid Xrefs data. It should be an array');

  // Load Rooms from Links
  const { xrefs } = data;

  for (let xrefIdx in xrefs) {
    let xref = xrefs[xrefIdx];
    const { derivativeId } = xref;

    await loadRoomsAsync(viewer, 'urn:' + derivativeId);
  }
};

function launchViewer(urn, viewableId) {
  if (viewer != null) {
    viewer.tearDown()
    viewer.finish()
    viewer = null
    $('#apsViewer').empty();
  }
  const options = {
    env: 'AutodeskProduction',
    //env: 'AutodeskProduction2',
    //api: 'streamingV2',
    getAccessToken: getApsToken
  };

  Autodesk.Viewing.Initializer(options, async () => {
    const config3d = {
      modelBrowserStartCollapsed: true,
      modelBrowserExcludeRoot: false,
      // extensions: ['']
    };
    viewer = new Autodesk.Viewing.GuiViewer3D(document.getElementById('apsViewer'), config3d);
    viewer.start();
    const hostDocumentId = 'urn:' + urn;
    await loadViewAsync(viewer, hostDocumentId, viewableId, null);
  });
}

function getApsToken(callback) {
  jQuery.ajax({
    url: '/api/auth/token',
    success: function (res) {
      callback(res.access_token, res.expires_in)
    }
  });
}
