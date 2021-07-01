// ELEMENT REFERENCES
const applyAttributesButton = document.getElementById(
  'apply-attributes-button'
);
const closureTitleEl = document.getElementById('closure-title');
const closureSelectorInputs = document.querySelectorAll(
  "input[type=radio][name='closure']"
);
const closureDescriptionEl = document.getElementById('closure-description');
const closureStartDateEl = document.getElementById('closure-start');
const closureEstimatedEndDateEl = document.getElementById(
  'closure-estimated-end'
);

/////////////////
// Set up map //
///////////////

let session = null;
const clientId = '2sTSmcY1sy7bTbRt';
const redirectUri = window.location.href + '/authenticate.html';

const serializedSession = localStorage.getItem('__ARCGIS_REST_USER_SESSION__');
if (serializedSession !== null && serializedSession !== undefined) {
  let parsed = JSON.parse(serializedSession);
  parsed.tokenExpires = new Date(parsed.tokenExpires);
  session = new arcgisRest.UserSession(parsed);
  localStorage.removeItem('__ARCGIS_REST_USER_SESSION__');
}

function updateSessionInfo(session) {
  let signInButton = document.getElementById('withPopupButton');
  let sessionInfo = document.getElementById('sessionInfo');
  let signOutButton = document.getElementById("signOutButton")

  if (session) {
    signInButton.style.display = "none"
    signOutButton.style.display = "block"
    console.log(session)
    sessionInfo.innerHTML = 'Logged in as ' + session.username;
    localStorage.setItem('__ARCGIS_REST_USER_SESSION__', session.serialize());
  } else {
    signInButton.style.display = "block"
    signOutButton.style.display = "none"
    sessionInfo.innerHTML = 'Log in to start a session.';
  }
}

updateSessionInfo(session);

document.getElementById('withPopupButton').addEventListener('click', event => {
  arcgisRest.UserSession.beginOAuth2({
    clientId: clientId,
    redirectUri: redirectUri,
    popup: true
  })
    .then(newSession => {
      session = newSession;
      console.log(session);
      updateSessionInfo(session);
    })
    .catch(error => {
      console.log(error);
    });
  event.preventDefault();
});

document.getElementById('signOutButton').addEventListener('click', event => {
  event.preventDefault();
  session = null;
  localStorage.removeItem('__ARCGIS_REST_USER_SESSION__');
  updateSessionInfo();
});

const map = L.map('map', {
  center: [35.798532, -78.644599],
  zoom: 12,
  renderer: L.canvas({tolerance: 15})
});

// LEAFLET MAP CONTROLS
// Layer Control
const layerControl = L.control
  .layers(null, null, {
    position: 'bottomleft',
    collapsed: true,
    sortLayers: true
  })
  .addTo(map);

const basemap = L.tileLayer.provider('CartoDB.Positron').addTo(map);

// FEATURE LAYERS (ordered bottom to top)

// Feature Layer Panes
map.createPane('greenwayTrails');
map.createPane('ongoingClosures');
map.createPane("drawnClosure");
map.createPane('mileMarkers');

// Existing Greenway Trails
let greenwaysJSON;
let greenwaysLayer;
fetch(
  'https://opendata.arcgis.com/datasets/23836bb9145943d485252d9665020ff1_0.geojson'
)
  .then(response => response.json())
  .then(responseJSON => {
    let greenwaysFeaturesArray = responseJSON.features
      .map(feature => turf.flatten(feature))
      .map(fc => fc.features)
      .flat();
    greenwaysJSON = turf.featureCollection(greenwaysFeaturesArray);
    greenwaysLayer = L.geoJSON(greenwaysJSON, {
      style: {
        color: '#121212',
        weight: 1,
        opacity: 1
      },
      pane: 'greenwayTrails'
    });
    greenwaysLayer.addTo(map);
    layerControl.addOverlay(greenwaysLayer, 'Raleigh Greenway Trails');
  });

// Ongoing Greenway Closures
function ongoingClosuresStyle(feature) {
  let color;
  switch (feature.properties.gwstatus) {
    case 'CLOSED_STORM':
      color = '#673AB7';
      break;
    case 'CLOSED_TEMP':
      color = '#b71c1c';
      break;
    case 'ALERT':
      color = '#FFEB3B';
    default:
      color = '#78909C';
  }
  return { color: color, weight: 3, opacity: 1 };
}

const ongoingClosuresLayer = L.esri.featureLayer({
  url:
    'https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Greenway_Closures_Creator_Demo_Ongoing_Closures_View/FeatureServer/0',
  style: ongoingClosuresStyle,
  pane: 'ongoingClosures',
  onEachFeature: closurePopup
});
ongoingClosuresLayer.addTo(map);
layerControl.addOverlay(
  ongoingClosuresLayer,
  'Ongoing Greenway Trail Closures'
);

// Mile markers
const mileMarkersLayer = L.esri.featureLayer({
  url:
    'https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Greenway_Quarter_Mile_Markers/FeatureServer/0',
  pane: 'mileMarkers',
  pointToLayer: function(feature, latlng) {
    return L.marker(latlng, {
      icon: L.divIcon({
        iconSize: null,
        className: 'label',
        html: '<div">' + feature.properties.MARKERMILE + '</div>'
      })
    });
  }
});

layerControl.addOverlay(mileMarkersLayer, 'Greenway Mile Markers');

// Drawn Clip Feature
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);
// Draw
const drawControl = new L.Control.Draw({
  draw: {
    polyline: false,
    circle: false,
    rectangle: false,
    marker: false,
    circlemarker: false,
    polygon: {
      icon: new L.DivIcon({
        iconSize: new L.Point(8, 8),
        className: 'leaflet-div-icon leaflet-editing-icon my-own-icon'
      }),
      allowIntersection: false,
      shapeOptions: {
        color: '#123abc'
      }
    }
  },
  edit: {
    featureGroup: drawnItems
  },
  position: 'topright'
});
map.addControl(drawControl);

// Draw Events

map.on(L.Draw.Event.DRAWSTART, e => {
  drawnItems.clearLayers()
  clippedResultLayer.clearLayers()
})

map.on(L.Draw.Event.CREATED, e => {  
  let layer = e.layer;
  layer.setStyle({
    color: "#01426A",
    fillColor: "#E0EEF4",
    fillOpacity: 0.5,
    weight: 2
  });
  drawnItems.addLayer(layer);
  processClip();
  map.fitBounds(clippedResultLayer.getBounds())
    
});
map.on(L.Draw.Event.EDITVERTEX, e => {
  processClip();
})


function processClip() {
  // Clear the previous result
  clippedResultLayer.clearLayers();

  // Clip the greenways by the newly drawn feature
  let clipFeature = drawnItems.toGeoJSON().features[0];
  let clippedResultFeatureCollection = clipLinesByFeature(
    greenwaysJSON,
    clipFeature
  );

  // Dissolve the result into a single feature
  clippedResultSingleFeature = dissolveLines(clippedResultFeatureCollection);

  // Remove collectedProperties
  clippedResultSingleFeature.features.forEach(
    feature => delete feature.properties['collectedProperties']
  );

  // Add result to map
  let clippedResultSingleFeatureLayer = L.geoJSON(clippedResultSingleFeature, {
    style: {
      color: "#046A38",
      weight: 6
    },
    pane: "drawnClosure"
  });
  clippedResultLayer.addLayer(clippedResultSingleFeatureLayer);
  
}

map.on(L.Draw.Event.DELETED, e => {
  clippedResultLayer.clearLayers();
  drawnItems.clearLayers();
  // outputJSONEl.textContent = '';
});

// Clip result
const clippedResultLayer = new L.FeatureGroup();
map.addLayer(clippedResultLayer);

// FUNCTIONALITY: Add Closure to data
const greenwayClosuresServiceLayerUrl =
  'https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/greenway_closures_creator_demo_layer/FeatureServer/0';
const addClosureButton = document.getElementById('add-closure-button');
addClosureButton.addEventListener('click', () => {
  let closureTitle = closureTitleEl.value;
  let selectedClosureStatus = getCheckedRadioValue(closureSelectorInputs);
  let closureDescription = closureDescriptionEl.value;
  let closureStartDate = closureStartDateEl.value;
  let closureEstimatedEndDate = closureEstimatedEndDateEl.value;
  console.log(clippedResultSingleFeature)

  try {
    dateRangeTest(Date.parse(closureStartDate), Date.parse(closureEstimatedEndDate))
    clippedResultSingleFeature.features.forEach(feature => {
      feature.properties['closure_title'] = closureTitle;
      feature.properties['gwstatus'] = selectedClosureStatus;
      feature.properties['description'] = closureDescription;
      feature.properties['closure_start_date'] = closureStartDate;
      feature.properties[
        'closure_estimated_end_date'
      ] = closureEstimatedEndDate;
    });
  } catch (error) {
    console.log(error);
    console.log('No clip has been set yet');
  }


  let featureToAdd = Terraformer.geojsonToArcGIS(clippedResultSingleFeature);
  arcgisRest
    .addFeatures({
      url: greenwayClosuresServiceLayerUrl,
      features: featureToAdd,
      params: {
        token: session.token
      }
    })
    .then(handleAdded)
    .catch(error => {
      console.log(error);
    });
});

// FUNCTIONS
function clipLinesByFeature(linesJSON, clipFeature) {
  let clippedLinesArray = [];

  turf.featureEach(linesJSON, segment => {
    // Check if the line feature is fully within the clip area. If it is, add it to linesArray.
    if (turf.booleanWithin(segment, clipFeature)) {
      clippedLinesArray.push(segment);
    } else {
      // If the segment is not fully within the clip area, split the line by the clip area
      let splitSegments = turf.lineSplit(segment, clipFeature);
      // Take the resulting features from the split, calculate a point on surface, and check if the point is within the clip area. If it is, add the line segment to linesArray.
      turf.featureEach(splitSegments, splitSegment => {
        let pointOnSplitSegment = turf.pointOnFeature(splitSegment);
        if (turf.booleanWithin(pointOnSplitSegment, clipFeature)) {
          clippedLinesArray.push(splitSegment);
        }
      });
    }
  });
  return turf.featureCollection(clippedLinesArray);
}

function dissolveLines(linesJSON) {
  // Flatten all features into an aray to explode any MultiLinestring features to LineString feature
  let flattenedLines = linesJSON.features
    .map(feature => turf.flatten(feature))
    .map(fc => fc.features)
    .flat();
  // Create FeatureCollection of flattened LineString features
  let flattenedLinesFeatureCollection = turf.featureCollection(flattenedLines);
  // Combine LineString features into a single MultiLineString
  return turf.combine(flattenedLinesFeatureCollection);
}

function getCheckedRadioValue(selectors) {
  let checkedName;
  selectors.forEach(selector => {
    if (selector.checked) {
      checkedName = selector.value;
    }
  });
  return checkedName;
}

function handleAdded(response) {
  console.log(response);

  if (!response.addResults[0].success) {
    // stop early if adding a new feature was not successful
    return;
  } else {
    resetApp()

    modalEl.style.display = "flex"
    modalMap = new L.map("modal-map", {
      center: [0, 0],
      zoom: 1,
      zoomControl: false,
      scrollWheelZoom: false,
      touchZoom: false,
      dragging: false,
      keyboard: false
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(modalMap)

    let addedFeatureLayer = L.esri.featureLayer({
      url: "https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Greenway_Closures_Creator_Demo_Ongoing_Closures_View/FeatureServer/0",
      where: `OBJECTID=${response.addResults[0].objectId}`
    }).addTo(modalMap)

    addedFeatureLayer.once("load", e => {
      let addedFeatureLayerBounds = L.latLngBounds([])
      let addedFeatureAttributes;
      addedFeatureLayer.eachFeature(layer => {
        let addedFeatureBounds = layer.getBounds()
        addedFeatureLayerBounds.extend(addedFeatureBounds)
        
        addedFeatureAttributes = layer.feature.properties
      })
      
      console.log(addedFeatureAttributes)
      let closureModalInfoListHTML = "<ul>";
      if (addedFeatureAttributes.closure_title) closureModalInfoListHTML+=`<li><b>Title:</b> ${addedFeatureAttributes.closure_title}</li>`
      if (addedFeatureAttributes.gwstatus) closureModalInfoListHTML+=`<li><b>Status:</b> ${addedFeatureAttributes.gwstatus}</li>`
      if (addedFeatureAttributes.closure_start_date && addedFeatureAttributes.closure_start_date > 0) closureModalInfoListHTML+=`<li><b>Start Date:</b> ${new Date(addedFeatureAttributes.closure_start_date).toLocaleDateString()}</li>`
      if (addedFeatureAttributes.closure_estimated_end_date && addedFeatureAttributes.closure_estimated_end_date > 0) closureModalInfoListHTML+=`<li><b>End Date (estimated):</b> ${new Date(addedFeatureAttributes.closure_estimated_end_date).toLocaleDateString()}</li>`
      if (addedFeatureAttributes.description) closureModalInfoListHTML+=`<li><b>Description:</b> ${addedFeatureAttributes.description}</li>`
      closureModalInfoListHTML+=`</ul>`
      
      document.getElementById("modal-closure-data-list").innerHTML = closureModalInfoListHTML
      modalMap.fitBounds(addedFeatureLayerBounds, {
        padding: [25, 25],
        maxZoom: 15
      })
    })
  }
}

function closurePopup(feature, layer) {
  let featureProperties = feature.properties;
  let title = featureProperties.closure_title;
  let description = featureProperties.description;
  let closureStartDate = new Date(featureProperties.closure_start_date).toLocaleDateString()
  let estClosureEndDate = new Date(featureProperties.closure_estimated_end_date).toLocaleDateString()
  
  let popupHtml = `
  <h1 style="font-size:1rem;">${title}</h1>
  <b>Closure Start:</b> ${closureStartDate}
  <br>
  <b>Estimated End:</b> ${estClosureEndDate}
  <br>
  <b>Description</b>
  <br>
  ${description}
  `
  layer.bindPopup(popupHtml)
}

function allNonNullFieldsPopup(feature, layer) {
  let featureProperties = feature.properties;
  let popupHtml = "";
  for (let property in featureProperties) {
    if (featureProperties[property] !== null) {
      popupHtml += `<b>${property}:</b> ${featureProperties[property]}<br>`;
    }
  }
  layer.bindPopup(popupHtml);
}
function dateRangeTest(startDate, endDate) {
  if (startDate > endDate) {
    alert("Start date must be on or before end date")
    throw "Start date must be on or before end date"
  }
}

function resetApp() {
  drawnItems.clearLayers();
  clippedResultLayer.clearLayers();
  closureTitleEl.value = null;
  closureDescriptionEl.value = null;
  closureStartDateEl.value = null;
  closureEstimatedEndDateEl.value = null;
  // outputJSONEl.textContent = '';
  clippedResultSingleFeature = undefined;
  document.getElementsByClassName("sidebar")[0].scrollTo({
    top: 0,
    behavior: "smooth"
  })
}

const modalButton = document.getElementById("modal-btn")
const modalEl = document.getElementById("success-modal")
var closeEl = document.getElementsByClassName("close")[0]
let modalMap

window.onclick = function(event) {
  if (event.target == modalEl) {
    modalMap.remove()
    modalEl.style.display = "none";
  }
}
closeEl.onclick = function() {
  modalMap.remove();
  modalEl.style.display = "none";
}

