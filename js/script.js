/* Earthquake Depth Explorer: one filtered dataset drives all three views. */
(() => {
  'use strict';
  const GLOBAL_SNAPSHOT_URL = 'data/global-4.5-month.geojson';
  const COUNTRIES_URL = 'data/countries-50m.geojson';
  const LIVE_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson';
  const REFRESH_MS = 5 * 60 * 1000;
  const ALL_ID = 'ALL';
  const countryChoices = [{id:ALL_ID, name:'All countries / worldwide'}];
  const GLOBAL_REGION = {name:'Worldwide',minLat:-90,maxLat:90,minLng:-180,maxLng:180,centerLat:0,centerLng:0};
  let REGION = null;
  let regionPolygons = [];
  const countryMap = new Map();
  const KM_PER_DEG = 111.32;
  const BORDER_BUFFER_KM = 200;
  const COUNTRY_DEPTH_FACTOR = 3;
  const GLOBAL_DEPTH_FACTOR = 60;
  const DEPTH_MAX = 700;
  const COLORS = { shallow: '#36d7d1', middle: '#ffbb60', deep: '#ed6687' };
  const SELECTED_COLOR = '#ffffff';
  const $ = id => document.getElementById(id);
  const fields = ['date-start', 'date-end', 'mag-min', 'mag-max', 'depth-min', 'depth-max'].map($);
  const state = { all: [], filtered: [], selectedId: null, globe: null, volume: null, mode: 'live', request: null, generated: null, globalData: null, countryId: ALL_ID };
  let countryMatches = [];
  let activeCountryIndex = 0;

  function syncCountryInput() {
    const input = $('region-search');
    if ($('country-options').hidden) input.value = countryChoices.find(choice => choice.id === state.countryId)?.name || 'All countries / worldwide';
  }
  function setActiveCountry(index) {
    const options = $('country-options');
    const input = $('region-search');
    activeCountryIndex = index;
    [...options.querySelectorAll('[role="option"]')].forEach((option, i) => {
      option.classList.toggle('active', i === index);
      if (i === index) {
        if (option.offsetTop < options.scrollTop) options.scrollTop = option.offsetTop;
        else if (option.offsetTop + option.offsetHeight > options.scrollTop + options.clientHeight)
          options.scrollTop = option.offsetTop + option.offsetHeight - options.clientHeight;
      }
    });
    if (countryMatches[index]) input.setAttribute('aria-activedescendant', `country-option-${countryMatches[index].id}`);
    else input.removeAttribute('aria-activedescendant');
  }
  function renderCountryOptions(query = '') {
    const options = $('country-options');
    const term = query.trim().toLocaleLowerCase('en');
    countryMatches = countryChoices.filter(choice => choice.name.toLocaleLowerCase('en').includes(term));
    options.replaceChildren();
    if (!countryMatches.length) {
      const empty = document.createElement('div');
      empty.className = 'country-empty';
      empty.textContent = 'No matching country or area';
      options.appendChild(empty);
      setActiveCountry(-1);
      return;
    }
    countryMatches.forEach(choice => {
      const option = document.createElement('button');
      option.type = 'button';
      option.id = `country-option-${choice.id}`;
      option.className = 'country-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(choice.id === state.countryId));
      option.tabIndex = -1;
      option.textContent = choice.name;
      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => {
        closeCountryOptions(false);
        $('region-search').value = choice.name;
        changeCountry(choice.id);
      });
      options.appendChild(option);
    });
    setActiveCountry(Math.max(0, countryMatches.findIndex(choice => choice.id === state.countryId)));
  }
  function openCountryOptions() {
    $('country-options').hidden = false;
    $('region-search').setAttribute('aria-expanded', 'true');
    renderCountryOptions();
    $('region-search').select();
  }
  function closeCountryOptions(restore = true) {
    $('country-options').hidden = true;
    $('region-search').setAttribute('aria-expanded', 'false');
    $('region-search').removeAttribute('aria-activedescendant');
    if (restore) syncCountryInput();
  }
  function initCountryPicker() {
    const input = $('region-search');
    input.addEventListener('focus', openCountryOptions);
    input.addEventListener('input', () => { $('country-options').hidden = false; input.setAttribute('aria-expanded', 'true'); renderCountryOptions(input.value); });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') { closeCountryOptions(); input.blur(); return; }
      if (event.key === 'Tab') { closeCountryOptions(); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if ($('country-options').hidden) openCountryOptions();
        else if (countryMatches.length) setActiveCountry((activeCountryIndex + (event.key === 'ArrowDown' ? 1 : -1) + countryMatches.length) % countryMatches.length);
      }
      if (event.key === 'Enter' && !$('country-options').hidden && countryMatches[activeCountryIndex]) {
        event.preventDefault();
        const choice = countryMatches[activeCountryIndex];
        closeCountryOptions(false);
        input.value = choice.name;
        changeCountry(choice.id);
      }
    });
    document.addEventListener('pointerdown', event => { if (!event.target.closest('.country-picker')) closeCountryOptions(); });
  }

  function depthColor(km) { return km < 70 ? COLORS.shallow : km <= 300 ? COLORS.middle : COLORS.deep; }
  function isSelected(event) { return state.selectedId !== null && event.id === state.selectedId; }
  function globeColor(event) { return isSelected(event) ? SELECTED_COLOR : depthColor(event.depth); }
  function globeRadius(event) {
    const base = .17 + .04 * Math.pow(Math.max(event.mag - 4, 0), 1.5);
    return isSelected(event) ? base * 1.4 : base;
  }
  function globeHeight(event) {
    const magnitudeHeight = .03 + .015 * Math.pow(Math.max(event.mag - 4, 0), 1.7);
    return isSelected(event) ? magnitudeHeight + .08 : magnitudeHeight;
  }
  function volumeRadius(magnitude) {
    return 1 + .33 * Math.pow(Math.max(magnitude - 4, 0), 1.45);
  }
  function updateGlobeMarker(mesh, event) {
    const globe = state.globe;
    const radius = globe.getGlobeRadius();
    const height = globeHeight(event) * radius;
    const width = Math.sin(globeRadius(event) * Math.PI / 180) * radius;
    mesh.geometry.dispose();
    mesh.geometry = new THREE.CylinderGeometry(width, width, height, 8);
    mesh.material.color.set(globeColor(event));
    const position = globe.getCoords(event.lat, event.lng, globeHeight(event) / 2);
    mesh.position.set(position.x, position.y, position.z);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), mesh.position.clone().normalize());
  }
  function makeGlobeMarker(event) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 8),
      new THREE.MeshBasicMaterial({color:globeColor(event)})
    );
    updateGlobeMarker(mesh, event);
    return mesh;
  }
  function depthFactor() { return state.countryId === ALL_ID ? GLOBAL_DEPTH_FACTOR : COUNTRY_DEPTH_FACTOR; }
  function unwrapLng(lng) { return lng + 360 * Math.round((REGION.centerLng - lng) / 360); }
  function regionFromCountry(feature) {
    const [minLng,minLat,maxLng,maxLat] = feature.properties.bounds;
    const edgeLat = Math.min(85, Math.max(Math.abs(minLat), Math.abs(maxLat)));
    const latPadding = BORDER_BUFFER_KM / KM_PER_DEG;
    const lngPadding = BORDER_BUFFER_KM / (KM_PER_DEG * Math.cos(edgeLat * Math.PI / 180));
    return {name:feature.properties.name,minLng:minLng-lngPadding,minLat:Math.max(-90,minLat-latPadding),maxLng:maxLng+lngPadding,maxLat:Math.min(90,maxLat+latPadding),centerLng:(minLng+maxLng)/2,centerLat:(minLat+maxLat)/2};
  }
  function regionAltitude() { return Math.min(3, Math.max(.55, Math.max(REGION.maxLat-REGION.minLat, REGION.maxLng-REGION.minLng) * .045)); }
  function countryPolygons(feature) {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    return polygons.map(polygon => polygon.map(ring => ring.map(([lng,lat]) => [unwrapLng(lng),lat])));
  }
  function ringContains(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1,y1] = ring[i], [x2,y2] = ring[j];
      if ((y1 > lat) !== (y2 > lat) && lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1) inside = !inside;
    }
    return inside;
  }
  function nearRing(lng, lat, ring) {
    const kmPerLng = KM_PER_DEG * Math.max(.05, Math.cos(lat * Math.PI / 180));
    const limit = BORDER_BUFFER_KM * BORDER_BUFFER_KM;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const dx = (ring[i][0] - ring[j][0]) * kmPerLng;
      const dy = (ring[i][1] - ring[j][1]) * KM_PER_DEG;
      const px = (lng - ring[j][0]) * kmPerLng;
      const py = (lat - ring[j][1]) * KM_PER_DEG;
      const ratio = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
      if ((px - ratio * dx) ** 2 + (py - ratio * dy) ** 2 <= limit) return true;
    }
    return false;
  }
  function inMappedCountry(event) {
    if (state.countryId === ALL_ID) return true;
    const {plotLng:lng, lat} = event;
    return regionPolygons.some(polygon => (ringContains(lng, lat, polygon[0]) && !polygon.slice(1).some(hole => ringContains(lng, lat, hole))) || nearRing(lng, lat, polygon[0]));
  }
  function updateRegionUI() {
    syncCountryInput();
    $('region-note').textContent = state.countryId === ALL_ID
      ? 'Showing all reported events worldwide. The flat 2D/3D projection is approximate; choose a country for depth analysis.'
      : `${REGION.name}: events inside the mapped boundary or within ${BORDER_BUFFER_KM} km of it. The 2D/3D frame uses the area's bounding extent.`;
    $('source-heading').textContent = `USGS · ${state.countryId === ALL_ID ? 'worldwide' : REGION.name} · ${state.mode === 'live' ? 'latest 30 days' : 'global demo snapshot'}`;
    $('depth-factor').textContent = depthFactor();
    $('comparison-note').textContent = state.countryId === ALL_ID
      ? 'Worldwide view provides context. Select a country or area for a more useful depth comparison.'
      : '2D reveals the surface pattern. Rotate the 3D volume to separate overlapping points and examine depth structure.';
  }
  function toKm(lat, lng) {
    return { east: (lng - REGION.centerLng) * KM_PER_DEG * Math.cos(REGION.centerLat * Math.PI / 180), north: (lat - REGION.centerLat) * KM_PER_DEG };
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function parseEvents(data) {
    const seen = new Set();
    return data.features.filter(f => typeof f.id === 'string' && f.id && f.geometry && f.geometry.coordinates && (!f.properties.type || f.properties.type === 'earthquake')).map(f => {
      const [lng, lat, depth] = f.geometry.coordinates;
      const plotLng = unwrapLng(lng);
      return { id: f.id, lng, plotLng, lat, depth, mag: f.properties.mag, place: f.properties.place || 'Unknown location', time: new Date(f.properties.time), url: f.properties.url, ...toKm(lat, plotLng) };
    }).filter(e => {
      if (!Number.isFinite(e.mag) || !Number.isFinite(e.depth) || e.depth < 0 || !Number.isFinite(e.lat) || !Number.isFinite(e.lng) || e.lat < REGION.minLat || e.lat > REGION.maxLat || e.plotLng < REGION.minLng || e.plotLng > REGION.maxLng || Number.isNaN(e.time.getTime()) || seen.has(e.id) || !inMappedCountry(e)) return false;
      seen.add(e.id);
      return true;
    });
  }
  function validateFilters() {
    const [from, to, magMin, magMax, depMin, depMax] = fields.map(f => f.value);
    const nums = [magMin, magMax, depMin, depMax].map(Number);
    if (!from || !to || nums.some((n, i) => !Number.isFinite(n) || fields[i + 2].value === '') || from > to || nums[0] > nums[1] || nums[2] > nums[3] || nums[2] < 0) return null;
    return { from, to, magMin: nums[0], magMax: nums[1], depMin: nums[2], depMax: nums[3] };
  }
  function filterEvents() {
    const f = validateFilters();
    $('filter-error').textContent = f ? '' : 'Invalid filter range. Check the dates and minimum/maximum values.';
    if (!f) return;
    state.filtered = state.all.filter(e => {
      const day = e.time.toISOString().slice(0, 10);
      return day >= f.from && day <= f.to && e.mag >= f.magMin && e.mag <= f.magMax && e.depth >= f.depMin && e.depth <= f.depMax;
    });
    if (!state.filtered.some(e => e.id === state.selectedId)) state.selectedId = null;
    renderAll();
  }
  function selectEvent(id, source = 'globe') {
    const event = state.filtered.find(item => item.id === id);
    if (!event) return;
    state.selectedId = state.selectedId === id ? null : id;
    renderAll();
    if (state.selectedId && source !== 'globe') {
      const altitude = state.globe.pointOfView().altitude;
      state.globe.pointOfView({lat:event.lat, lng:event.lng, altitude}, 900);
    }
  }
  function renderDetail() {
    const e = state.filtered.find(item => item.id === state.selectedId);
    const el = $('event-detail');
    $('event-card').hidden = !e;
    if (!e) { el.replaceChildren(); return; }
    el.innerHTML = `<p class="detail-title">M${e.mag.toFixed(1)} · ${escapeHtml(e.place)}</p><dl class="detail-grid"><dt>Depth</dt><dd>${e.depth.toFixed(1)} km</dd><dt>Time</dt><dd>${e.time.toLocaleString('en-GB', {timeZone:'UTC'})} UTC</dd><dt>Latitude</dt><dd>${e.lat.toFixed(3)}°</dd><dt>Longitude</dt><dd>${e.lng.toFixed(3)}°</dd><dt>Position</dt><dd>${e.east.toFixed(0)} km E-W / ${e.north.toFixed(0)} km N-S</dd></dl><p><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener">View event at USGS ↗</a></p><button id="clear-selection" type="button">Clear selection</button>`;
    $('clear-selection').addEventListener('click', () => { state.selectedId = null; renderAll(); });
  }
  function initGlobe() {
    const host = $('globeViz');
    const globe = Globe()(host)
      .globeImageUrl('assets/earth.jpg')
      .backgroundColor('#0b1723')
      .showAtmosphere(true)
      .atmosphereColor('#62b7d2')
      .polygonsData([])
      .polygonCapColor(() => 'rgba(88,217,219,0.08)')
      .polygonSideColor(() => 'rgba(88,217,219,0.05)')
      .polygonStrokeColor(() => '#58d9db')
      .polygonAltitude(.005)
      .customLayerData([])
      .customThreeObject(makeGlobeMarker)
      .customThreeObjectUpdate(updateGlobeMarker)
      .customLayerLabel(d => `<div class="globe-tip">M${d.mag.toFixed(1)} · ${escapeHtml(d.place)}<br>${d.depth.toFixed(1)} km</div>`)
      .onCustomLayerClick(d => selectEvent(d.id));
    globe.controls().autoRotate = false;
    globe.controls().enableDamping = true;
    globe.pointOfView({lat:15,lng:0,altitude:1.7}, 0);
    new ResizeObserver(() => globe.width(host.clientWidth).height(host.clientHeight)).observe(host);
    state.globe = globe;
  }
  function textSprite(text, color = '#b9d1d8') {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 64;
    const ctx = canvas.getContext('2d'); ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = color; ctx.fillText(text, 5, 42);
    const material = new THREE.SpriteMaterial({map: new THREE.CanvasTexture(canvas), transparent:true, depthTest:false});
    const sprite = new THREE.Sprite(material); sprite.scale.set(25, 3.2, 1); return sprite;
  }
  function addLine(scene, a, b, color) {
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
    scene.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({color})));
  }
  function initVolume() {
    const host = $('volumeViz');
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b1723');
    const camera = new THREE.PerspectiveCamera(45, 1, .1, 4000);
    const renderer = new THREE.WebGLRenderer({antialias:true, alpha:false}); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); host.appendChild(renderer.domElement);
    const controls = new THREE.OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .08; controls.minDistance = 15; controls.maxDistance = 3000;
    const group = new THREE.Group(); scene.add(group);
    const frameGroup = new THREE.Group(); scene.add(frameGroup);
    let kmPerUnit = 30;
    let bottom = -DEPTH_MAX / kmPerUnit * depthFactor();
    let span = 86;
    function rebuildFrame() {
      frameGroup.traverse(object => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) { if (object.material.map) object.material.map.dispose(); object.material.dispose(); }
      });
      frameGroup.clear();
      const widthKm = (REGION.maxLng - REGION.minLng) * KM_PER_DEG * Math.cos(REGION.centerLat * Math.PI / 180);
      const heightKm = (REGION.maxLat - REGION.minLat) * KM_PER_DEG;
      kmPerUnit = Math.max(widthKm, heightKm) / 80;
      const xHalf = widthKm / kmPerUnit / 2;
      const zHalf = heightKm / kmPerUnit / 2;
      bottom = -DEPTH_MAX / kmPerUnit * depthFactor();
      span = Math.max(2*xHalf, 2*zHalf, Math.abs(bottom));
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2*xHalf, 2*zHalf), new THREE.MeshBasicMaterial({color:'#2b8588',transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false}));
      plane.rotation.x = -Math.PI / 2; frameGroup.add(plane);
      for (let i=0; i<=8; i++) {
        const x = -xHalf + i*xHalf/4, z = -zHalf + i*zHalf/4;
        addLine(frameGroup,[x,0,-zHalf],[x,0,zHalf],'#27424d');
        addLine(frameGroup,[-xHalf,0,z],[xHalf,0,z],'#27424d');
      }
      [[[-xHalf,0,-zHalf],[xHalf,0,-zHalf]], [[-xHalf,0,-zHalf],[-xHalf,0,zHalf]], [[-xHalf,0,-zHalf],[-xHalf,bottom,-zHalf]]]
        .forEach(([a,b]) => addLine(frameGroup,a,b,'#90b8bf'));
      [0,70,300,700].forEach(km => {
        const y = -km / kmPerUnit * depthFactor();
        addLine(frameGroup,[-xHalf,y,-zHalf],[-xHalf+3,y,-zHalf],'#90b8bf');
        const label=textSprite(`${km} km`); label.position.set(-xHalf-7,y,-zHalf); frameGroup.add(label);
      });
      const east=textSprite('East (+) / West (-) · km'); east.position.set(xHalf-9,2,-zHalf-3); frameGroup.add(east);
      const north=textSprite('North (+) / South (-) · km'); north.position.set(-xHalf+7,2,zHalf+3); frameGroup.add(north);
      const surface=textSprite('0 km · surface','#58d9db'); surface.position.set(0,3,0); frameGroup.add(surface);
      setView('3d');
    }
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    renderer.domElement.addEventListener('click', event => {
      const box = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX-box.left)/box.width*2-1, -(event.clientY-box.top)/box.height*2+1);
      raycaster.setFromCamera(pointer,camera);
      const hits = raycaster.intersectObjects(group.children, false);
      if (hits.length) selectEvent(hits[0].object.userData.id, 'volume');
    });
    function setView(view) {
      const target = new THREE.Vector3(0,bottom*.42,0); controls.target.copy(target);
      if (view === 'top') { camera.position.set(0,target.y+span*1.65,.01); camera.up.set(0,0,-1); }
      else if (view === 'side') { camera.position.set(0,target.y,span*1.65); camera.up.set(0,1,0); }
      else { camera.position.set(span*1.1,target.y+span*.85,span*1.2); camera.up.set(0,1,0); }
      camera.lookAt(target); controls.update();
      document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    }
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $('reset-camera').addEventListener('click', () => setView('3d'));
    new ResizeObserver(() => { const w=host.clientWidth,h=host.clientHeight; if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h); }).observe(host);
    function frame() { requestAnimationFrame(frame); controls.update(); renderer.render(scene,camera); } frame(); rebuildFrame();
    state.volume = {group, setView, rebuildFrame, kmPerUnit: () => kmPerUnit};
  }
  function renderVolume() {
    const group=state.volume.group;
    while(group.children.length) { const obj=group.children[0]; group.remove(obj); obj.geometry.dispose(); obj.material.dispose(); }
    const geometry = new THREE.SphereGeometry(1,12,8);
    state.filtered.forEach(e => {
      const selected=isSelected(e);
      const mesh=new THREE.Mesh(geometry.clone(),new THREE.MeshBasicMaterial({color:selected?SELECTED_COLOR:depthColor(e.depth)}));
      const radius=volumeRadius(e.mag)*(selected?1.4:1);
      mesh.scale.setScalar(radius);
      const kmPerUnit = state.volume.kmPerUnit();
      mesh.position.set(e.east/kmPerUnit,-e.depth/kmPerUnit*depthFactor(),-e.north/kmPerUnit);
      mesh.userData.id=e.id; group.add(mesh);
    });
    geometry.dispose();
  }
  const SVG='http://www.w3.org/2000/svg';
  function svg(tag, attrs, parent) { const node=document.createElementNS(SVG,tag); Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v)); parent.appendChild(node); return node; }
  function renderMap() {
    const root=$('map2d'); root.replaceChildren(); root.setAttribute('viewBox','0 0 1000 300');
    const box={left:110,right:965,top:48,bottom:250};
    const x=e=>box.left+((e.plotLng ?? e.lng)-REGION.minLng)/(REGION.maxLng-REGION.minLng)*(box.right-box.left);
    const y=e=>box.bottom-(e.lat-REGION.minLat)/(REGION.maxLat-REGION.minLat)*(box.bottom-box.top);
    for (let i=0; i<=5; i++) {
      const lng=REGION.minLng+(REGION.maxLng-REGION.minLng)*i/5, xx=x({lng});
      svg('line',{x1:xx,x2:xx,y1:box.top,y2:box.bottom,class:'svg-grid'},root);
      const t=svg('text',{x:xx,y:274,'text-anchor':'middle',class:'svg-label'},root);
      t.textContent=`${Math.round((lng-REGION.centerLng)*KM_PER_DEG*Math.cos(REGION.centerLat*Math.PI/180))} km`;
      const lat=REGION.minLat+(REGION.maxLat-REGION.minLat)*i/5, yy=y({lat});
      svg('line',{x1:box.left,x2:box.right,y1:yy,y2:yy,class:'svg-grid'},root);
      const v=svg('text',{x:99,y:yy+4,'text-anchor':'end',class:'svg-label'},root);
      v.textContent=`${Math.round((lat-REGION.centerLat)*KM_PER_DEG)} km`;
    }
    state.filtered.forEach(e=>{const selected=isSelected(e);const dot=svg('circle',{cx:x(e),cy:y(e),r:selected?7:Math.max(2.5,e.mag*.65),fill:selected?SELECTED_COLOR:depthColor(e.depth),stroke:selected?'#fff':'none',class:'map-point',tabindex:'0','aria-label':`M${e.mag.toFixed(1)}, ${e.place}, depth ${e.depth.toFixed(1)} km`},root);dot.addEventListener('click',()=>selectEvent(e.id,'map'));dot.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selectEvent(e.id,'map');}});});
    const east=svg('text',{x:960,y:295,'text-anchor':'end',class:'svg-label'},root);east.textContent='East–West (km)';
    const north=svg('text',{x:18,y:20,class:'svg-label'},root);north.textContent='North–South (km)';
  }
  function renderAll() {
    const count=state.filtered.length;
    $('count').textContent=`${count} / ${state.all.length} events`;
    state.globe.customLayerData([...state.filtered]);
    renderVolume();renderMap();renderDetail();
    let overlay=$('empty-overlay');
    if(!count && !overlay){overlay=document.createElement('div');overlay.id='empty-overlay';overlay.className='empty-overlay';$('volumeViz').appendChild(overlay);}
    if(overlay) overlay.textContent=count?'':'No events match the filters';
  }
  function resetFilters(mode) {
    const today = mode === 'globalSnapshot' ? new Date(state.generated) : new Date();
    const past = new Date(today);
    past.setUTCDate(past.getUTCDate() - 30);
    const values = [past.toISOString().slice(0,10), today.toISOString().slice(0,10), '4.5', '10', '0', '700'];
    values.forEach((value, i) => { fields[i].value = value; });
    fields[0].min = fields[1].min = values[0];
    fields[0].max = fields[1].max = values[1];
  }
  function showSource(mode, generated = state.generated) {
    updateRegionUI();
    if (mode === 'live') {
      const time = new Date(generated);
      $('source-status').textContent = `USGS M4.5+ past-month feed · updated ${time.toLocaleString('en-GB', {timeZone:'UTC'})} UTC · refreshes every 5 minutes. Click to refresh now.`;
    } else {
      $('source-status').textContent = `Saved global M4.5+ feed · captured ${new Date(generated).toLocaleString('en-GB', {timeZone:'UTC'})} UTC · stable for demos. Click to retry the latest feed.`;
    }
  }
  function applyDataset(data, mode, reset) {
    state.globalData = data;
    state.all = parseEvents(data);
    state.mode = mode;
    state.generated = data.metadata.generated;
    state.selectedId = null;
    if (reset) resetFilters(mode);
    showSource(mode, data.metadata && data.metadata.generated);
    filterEvents();
  }
  function activateCountry(id) {
    state.countryId = id;
    state.selectedId = null;
    if (id === ALL_ID) {
      REGION = GLOBAL_REGION;
      regionPolygons = [];
      state.globe.polygonsData([]);
      state.globe.pointOfView({lat:15,lng:0,altitude:2.5},700);
    } else {
      const feature = countryMap.get(id);
      REGION = regionFromCountry(feature);
      regionPolygons = countryPolygons(feature);
      state.globe.polygonsData([feature]);
      state.globe.pointOfView({lat:feature.properties.labelY,lng:feature.properties.labelX,altitude:regionAltitude()},700);
    }
    state.volume.rebuildFrame();
    updateRegionUI();
  }
  function changeCountry(id) {
    if ((id !== ALL_ID && !countryMap.has(id)) || id === state.countryId) return;
    if (state.globalData) {
      if (state.request) { state.request.abort(); state.request = null; }
      activateCountry(id);
      state.all = parseEvents(state.globalData); showSource(state.mode); filterEvents();
    } else {
      loadLive(true, id);
    }
  }
  async function fetchSource(url) {
    if (state.request) state.request.abort();
    const controller = new AbortController();
    state.request = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    try {
      const response = await fetch(url, {signal:controller.signal, cache:'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (timedOut) throw new Error('Data request timed out');
      throw error;
    } finally {
      clearTimeout(timeout);
      if (state.request === controller) state.request = null;
    }
  }
  async function loadGlobalSnapshot(message = '') {
    try {
      $('source-status').textContent = 'Loading saved global snapshot…';
      const data = await fetchSource(GLOBAL_SNAPSHOT_URL);
      applyDataset(data, 'globalSnapshot', true);
      if (message) $('source-status').textContent += ` ${message}`;
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error(error);
      if (!state.all.length) $('count').textContent = 'Data unavailable';
      $('source-status').textContent = 'Could not load the global snapshot. Run the project with a local web server.';
    }
  }
  async function loadLive(reset = false, countryId = null) {
    const previousMode = state.mode;
    $('source-status').textContent = 'Fetching the latest USGS feed…';
    $('refresh-now').disabled = true;
    try {
      const data = await fetchSource(LIVE_URL);
      if (countryId && countryId !== state.countryId) activateCountry(countryId);
      applyDataset(data, 'live', reset || previousMode !== 'live');
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error(error);
      if (!state.all.length) await loadGlobalSnapshot('Live feed unavailable; showing saved worldwide data.');
      else {
        syncCountryInput();
        showSource(state.mode);
        $('source-status').textContent = countryId
          ? `Could not load live data for ${countryId === ALL_ID ? 'the worldwide view' : countryMap.get(countryId).properties.name}. The previous area remains visible.`
          : state.mode === 'live'
            ? 'Live feed unavailable. Previous data remains visible; try Refresh latest feed.'
            : 'Live feed unavailable. The saved snapshot remains visible; use the refresh icon to retry.';
      }
    } finally {
      $('refresh-now').disabled = false;
    }
  }
  async function loadCountries() {
    const response = await fetch(COUNTRIES_URL);
    if (!response.ok) throw new Error(`Country boundaries: HTTP ${response.status}`);
    const collection = await response.json();
    collection.features.sort((a,b) => a.properties.name.localeCompare(b.properties.name, 'en'));
    collection.features.forEach(feature => {
      const id = feature.properties.id;
      countryMap.set(id, feature);
      countryChoices.push({id, name:feature.properties.name});
    });
    REGION = GLOBAL_REGION;
    updateRegionUI();
  }
  async function init() {
    try {
      await loadCountries();
      initCountryPicker();
      initGlobe(); initVolume();
      fields.forEach(f => f.addEventListener('input', filterEvents));
      $('reset-filters').addEventListener('click', () => { resetFilters(state.mode); filterEvents(); });
      $('refresh-now').addEventListener('click', () => loadLive(false));
      setInterval(() => { if (state.mode === 'live') loadLive(false); }, REFRESH_MS);
      if (new URLSearchParams(window.location.search).has('demo')) loadGlobalSnapshot();
      else loadLive(true);
    } catch (error) {
      console.error(error);
      $('count').textContent = 'Visualization unavailable';
      $('source-status').textContent = 'Check the local country data, WebGL support, and the Three.js / Globe.gl library connection.';
    }
  }
  document.addEventListener('DOMContentLoaded',init);
})();
