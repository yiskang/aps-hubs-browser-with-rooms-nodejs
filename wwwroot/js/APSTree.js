﻿/////////////////////////////////////////////////////////////////////
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
// AUTODESK PROVIDES THIS PROGRAM 'AS IS' AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

$(document).ready(function () {
  // first, check if current visitor is signed in
  jQuery.ajax({
    url: '/api/auth/token',
    success: function (res) {
      // yes, it is signed in...
      $('#signOut').show();
      $('#refreshHubs').show();

      // prepare sign out
      $('#signOut').click(function () {
        $('#hiddenFrame').on('load', function (event) {
          location.href = '/api/auth/logout';
        });
        $('#hiddenFrame').attr('src', 'https://accounts.autodesk.com/Authentication/LogOut');
        // learn more about this signout iframe at
        // https://aps.autodesk.com/blog/log-out-forge
      })

      // and refresh button
      $('#refreshHubs').click(function () {
        $('#userHubs').jstree(true).refresh();
      });

      // finally:
      prepareUserHubsTree();
      showUser();
    }
  });

  $('#autodeskSigninButton').click(function () {
    window.location.replace('/api/auth/login')
  })

  $.getJSON('/api/auth/clientid', function (res) {
    $('#ClientID').val(res.id);
    $('#provisionAccountSave').click(function () {
      $('#provisionAccountModal').modal('toggle');
      $('#userHubs').jstree(true).refresh();
    });
  });
});

function prepareUserHubsTree() {
  var haveBIM360Hub = false;
  $('#userHubs').jstree({
    'core': {
      'themes': { 'icons': true },
      'multiple': false,
      'data': {
        'url': '/api/datamanagement',
        'dataType': 'json',
        'cache': false,
        'data': function (node) {
          $('#userHubs').jstree(true).toggle_node(node);
          return { 'id': node.id };
        },
        'success': function (nodes) {
          nodes.forEach(function (n) {
            if (n.type === 'bim360Hubs' && n.id.indexOf('b.') > 0)
              haveBIM360Hub = true;
          });

          if (!haveBIM360Hub) {
            $('#provisionAccountModal').modal();
            haveBIM360Hub = true;
          }
        }
      }
    },
    'types': {
      'default': {
        'icon': 'glyphicon glyphicon-question-sign'
      },
      '#': {
        'icon': 'glyphicon glyphicon-user'
      },
      'hubs': {
        'icon': 'https://cdn.autodesk.io/dm/xs/a360hub.png'
      },
      'personalHub': {
        'icon': 'https://cdn.autodesk.io/dm/xs/a360hub.png'
      },
      'bim360Hubs': {
        'icon': 'https://cdn.autodesk.io/dm/xs/bim360hub.png'
      },
      'bim360projects': {
        'icon': 'https://cdn.autodesk.io/dm/xs/bim360project.png'
      },
      'a360projects': {
        'icon': 'https://cdn.autodesk.io/dm/xs/a360project.png'
      },
      'items': {
        'icon': 'glyphicon glyphicon-file'
      },
      'bim360documents': {
        'icon': 'glyphicon glyphicon-file'
      },
      'folders': {
        'icon': 'glyphicon glyphicon-folder-open'
      },
      'versions': {
        'icon': 'glyphicon glyphicon-time'
      },
      'views': {
        'icon': 'glyphicon glyphicon-question-sign'
      },
      'unsupported': {
        'icon': 'glyphicon glyphicon-ban-circle'
      }
    },
    'sort': function (a, b) {
      var a1 = this.get_node(a);
      var b1 = this.get_node(b);
      var parent = this.get_node(a1.parent);
      if (parent.type === 'items') {
        var id1 = Number.parseInt(a1.text.substring(a1.text.indexOf('v') + 1, a1.text.indexOf(':')))
        var id2 = Number.parseInt(b1.text.substring(b1.text.indexOf('v') + 1, b1.text.indexOf(':')));
        return id1 > id2 ? 1 : -1;
      }
      else if (parent.type === 'bim360Hubs') {
        return (a1.text > b1.text) ? 1 : -1;
      }
      else return a1.type < b1.type ? -1 : (a1.text > b1.text) ? 1 : 0;
    },
    'plugins': ['types', 'state', 'sort', 'contextmenu'],
    'contextmenu': { items: autodeskCustomMenu },
    'state': { 'key': 'autodeskHubs' }// key restore tree state
  }).bind('activate_node.jstree', function (evt, data) {
    if (data != null && data.node != null && (data.node.type == 'versions' || data.node.type == 'bim360documents' || data.node.type == 'views')) {
      if (data.node.id.indexOf('|') > -1) {
        let urn = data.node.id.split('|')[0];
        let viewableId = data.node.id.split('|')[1];
        launchViewer(urn, viewableId);
      }
      else {
        launchViewer(data.node.id);
      }
    }
  });
}

function autodeskCustomMenu(autodeskNode, buildContextMenu) {
  function loadRoomsFromLinksAction(event) {
    console.log(event);
    let tree = $.jstree.reference(event.reference);
    let node = tree.get_node(event.reference);

    console.log(node);

    const { projectId, versionId } = node.data;
    const escapedVersionId = encodeURIComponent(versionId);

    jQuery.ajax({
      url: `/api/datamanagement/projects/${projectId}/versions/${escapedVersionId}/links`,
      success: function (data) {
        console.log(data);

        loadRoomsFromXrefsAsync(data);
      }
    });
  }

  function loadRoomsAction(event) {
    console.log(event);
    let tree = $.jstree.reference(event.reference);
    let node = tree.get_node(event.reference);

    console.log(node);

    let urn = 'urn:' + node.id;
    loadRoomsAsync(viewer, urn);
  }

  var items;

  switch (autodeskNode.type) {
    case 'versions':
      if (viewer && viewer.model) {
        items = {
          loadRoomsFromLinksAction: {
            label: 'Load Rooms From Links',
            action: loadRoomsFromLinksAction
          },
          loadRoomsAction: {
            label: 'Load Rooms From Master Views',
            action: loadRoomsAction
          }
        };
      } else {
        items = {};
      }

      break;
    default:
      items = {};
      break;
  }

  buildContextMenu(items);
}

function showUser() {
  jQuery.ajax({
    url: '/api/auth/profile',
    success: function (profile) {
      var img = '<img src="' + profile.picture + '" height="30px">';
      $('#userInfo').html(img + profile.name);
    }
  });
}