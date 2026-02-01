// ---- SKALIERUNG + CANVAS ----
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Logical (CSS) size
let W = window.innerWidth;
let H = window.innerHeight;

// DPR-aware resize
function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;

  // CSS size
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";

  // Backing size
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);

  // Make drawing coordinates use CSS pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // recompute UI positions that use W/H
  updateMobileButtonPositions();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ---- POKI SDK (für später) ----
// window.PokiSDK ? PokiSDK.init() : null;

// ---- SPIEL KONSTANTEN ----
const TILE = 64;
const GRAVITY = 0.6;
const JUMP_FORCE = 12;

// ---- GAME STATE ----
let gameState = "menu"; // menu | play | end | pause | settings
let language = localStorage.getItem("shadowbound_lang") || "de"; // de | en
let levelIndex = 0;
let map;
let time = 0;
let dead = false;
let startTime = 0;
let bestTime = 0;
let score = 0;
let difficulty = 1; // 1=easy, 2=normal, 3=hard
let paused = false;
let soundEnabled = true;
let musicEnabled = true;
let mouseSensitivity = 0.002;
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let showMobileControls = isMobile || window.innerWidth < 768;

// ---- TRANSLATIONS ----
const texts = {
  de: { selectLang: "Wähle deine Sprache", shadowbound: "SHADOWBOUND", ready: "BEREIT?", clickStart: "KLICKE ZUM STARTEN" },
  en: { selectLang: "Select your language", shadowbound: "SHADOWBOUND", ready: "READY?", clickStart: "CLICK TO START" }
};
function t(k){ return texts[language]?.[k] || k; }

// ---- ACHIEVEMENTS / STORAGE ----
const achievements = {
  speedrunner: { name: "🏃 Speedrunner", desc: "Level in < 30s", score: 100 },
  survivor: { name: "💪 Survivor", desc: "Mit > 50% Health gewinnen", score: 150 },
  perfectRun: { name: "✨ Perfect Run", desc: "Level ohne Schaden", score: 300 },
  allLevels: { name: "👑 Master Vampire", desc: "Alle Level absolvieren", score: 500 }
};
let unlockedAchievements = JSON.parse(localStorage.getItem("achievements") || "{}");
let leaderboard = JSON.parse(localStorage.getItem("leaderboard") || "[]");

// ---- LEVELS (0=licht,1=schatten,2=ziel) ----
const levels = [
  [ [1,1,1,1,0], [0,1,1,1,2], [0,0,1,1,0] ],
  [ [1,1,1,1,1,2], [0,0,1,1,1,0], [0,0,1,0,0,0] ],
  [ [1,1,1,1,1,1,1,0,0,0], [0,0,1,1,1,1,1,1,1,0], [0,0,1,0,0,0,1,0,0,0], [1,1,1,0,1,1,1,1,1,2], [1,0,0,0,1,0,0,0,1,0] ]
];
map = levels[levelIndex];

// ---- PLAYER ----
const player = {
  x: 2.5 * TILE,
  y: 1.5 * TILE,
  z: 0,
  vz: 0,
  angle: 0,
  speed: 2,
  onGround: true,
  health: 100,
  speedBoost: 0,
  lightRadius: Math.min(W, H) / 3, // initial visible radius
  lightTimer: 0
};

// ---- CAMERA / EFFECTS ----
const camera = { x: player.x, y: player.y, lerp: 0.12, shake: 0, shakeTimer: 0 };
function applyScreenShake(intensity = 8, duration = 300) {
  camera.shake = Math.max(camera.shake, intensity);
  camera.shakeTimer = Math.max(camera.shakeTimer, duration);
}

// ---- ENTITIES ----
let guards = [];
let powerUps = [];
let particles = [];
let lights = [{ x: 3, y: 0, dir: 1 }];

// ---- AUDIO (simple) ----
const stepSound = new Audio("assets/sounds/step.mp3");
const deathSound = new Audio("assets/sounds/death.mp3");
const goalSound = new Audio("assets/sounds/goal.mp3");
const hitSound = new Audio("assets/sounds/hit.mp3");
const powerUpSound = new Audio("assets/sounds/powerup.mp3");
function playSound(sound){ if(soundEnabled) try{ sound.currentTime = 0; sound.play().catch(()=>{}); }catch(e){} }

let audioContext, gainNode, oscillator;
function initAudio(){
  if(!audioContext){
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);
    gainNode.gain.value = 0.06;
  }
}
function playBackgroundMusic(){
  if(!musicEnabled) return;
  initAudio();
  try {
    if(oscillator) oscillator.stop();
    oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(48, audioContext.currentTime);
    oscillator.connect(gainNode);
    oscillator.start();
  } catch(e){}
}
function stopBackgroundMusic(){ if(oscillator) try{ oscillator.stop(); }catch(e){} }

// ---- INPUT ----
const keys = {};
window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if(gameState === "play") keys[k] = true;
  if(k === "p") paused = gameState === "play" ? !paused : false;
  if(k === "m") soundEnabled = !soundEnabled;
  if(k === "u") musicEnabled = !musicEnabled;
  if(k === "s"){
    if(gameState === "play") gameState = "settings";
    else if(gameState === "settings") gameState = "play";
  }
});
window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

// ---- TOUCH / MOBILE ----
let touchStart = { x: 0, y: 0 }, touchCurrent = { x: 0, y: 0 };
const touchDeadzone = 50;
canvas.addEventListener("touchstart", e => { touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: false });
canvas.addEventListener("touchmove", e => {
  e.preventDefault();
  touchCurrent = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  const dx = touchCurrent.x - touchStart.x;
  if(Math.abs(dx) > touchDeadzone) {
    player.angle += dx * 0.01;
    touchStart.x = touchCurrent.x;
  }
}, { passive: false });

// Mobile buttons
let mobileButtons = {
  forward: { x: 0, y: 0, w: 60, h: 60, pressed: false, label: "↑" },
  backward: { x: 0, y: 0, w: 60, h: 60, pressed: false, label: "↓" },
  left: { x: 0, y: 0, w: 60, h: 60, pressed: false, label: "←" },
  right: { x: 0, y: 0, w: 60, h: 60, pressed: false, label: "→" },
  jump: { x: 0, y: 0, w: 60, h: 60, pressed: false, label: "⬆" },
  attack: { x: 0, y: 0, w: 60, h: 60, pressed: false, label: "⚔" },
  pause: { x: 0, y: 0, w: 60, h: 60, pressed: false, label: "⏸" }
};
function updateMobileButtonPositions(){
  mobileButtons.forward.x = Math.round(W/2 - 80); mobileButtons.forward.y = Math.round(H - 140);
  mobileButtons.backward.x = Math.round(W/2 - 80); mobileButtons.backward.y = Math.round(H - 60);
  mobileButtons.left.x = Math.round(W/2 - 160); mobileButtons.left.y = Math.round(H - 100);
  mobileButtons.right.x = Math.round(W/2); mobileButtons.right.y = Math.round(H - 100);
  mobileButtons.jump.x = Math.round(W - 100); mobileButtons.jump.y = Math.round(H - 140);
  mobileButtons.attack.x = Math.round(W - 100); mobileButtons.attack.y = Math.round(H - 60);
  mobileButtons.pause.x = 20; mobileButtons.pause.y = Math.round(H - 100);
}
updateMobileButtonPositions();

canvas.addEventListener("touchstart", e => {
  if(!showMobileControls) return;
  for(const t of e.touches){
    const x = t.clientX, y = t.clientY;
    for(const key in mobileButtons){
      const b = mobileButtons[key];
      if(x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h){
        b.pressed = true;
        if(key === "pause") paused = gameState === "play" ? !paused : false;
        if(key === "forward") keys["w"] = true;
        if(key === "backward") keys["s"] = true;
        if(key === "left") keys["a"] = true;
        if(key === "right") keys["d"] = true;
        if(key === "jump") keys[" "] = true;
        if(key === "attack") keys["e"] = true;
      }
    }
  }
}, { passive: false });
canvas.addEventListener("touchend", e => {
  if(!showMobileControls) return;
  for(const k in mobileButtons) mobileButtons[k].pressed = false;
  ["w","s","a","d"," ","e"].forEach(k => keys[k] = false);
}, { passive: false });

// Mouse look
canvas.addEventListener("click", () => { canvas.requestPointerLock?.(); });
window.addEventListener("mousemove", e => { if(document.pointerLockElement === canvas) player.angle += e.movementX * mouseSensitivity; });

// ---- INIT LEVEL / ENTITIES ----
function initLevel(){
  guards = []; powerUps = []; particles = [];
  player.health = 100; player.speedBoost = 0; player.lightRadius = Math.min(W, H) / 3; player.lightTimer = 0;
  const guardCount = 1 + difficulty;
  for(let i=0;i<guardCount;i++){
    guards.push({ x: Math.random() * map[0].length * TILE, y: Math.random() * map.length * TILE, health: 50, speed: 0.5 + difficulty * 0.3, angle: Math.random() * Math.PI * 2, range: 3 });
  }
}
function resetPlayer(){
  player.x = 2.5 * TILE; player.y = 1.5 * TILE; player.z = 0; player.vz = 0; player.health = 100;
  dead = false; startTime = performance.now(); player.lightRadius = Math.min(W, H) / 3; player.lightTimer = 0;
}

// ---- PARTICLES ----
function createParticles(x,y,count,color){
  for(let i=0;i<count;i++){
    particles.push({ x, y, z:0, vx:(Math.random()-0.5)*4, vy:(Math.random()-0.5)*4, vz:Math.random()*3, life:1, color });
  }
}
function updateParticles(){
  for(let i=particles.length-1;i>=0;i--){
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.z += p.vz; p.vz -= 0.2; p.life -= 0.02;
    if(p.life <= 0) particles.splice(i,1);
  }
}

// ---- RAYCAST / WORLD RENDER ----
const FOV = Math.PI/3;
const RAYS = 260;
function castRays(){
  for(let i=0;i<RAYS;i++){
    const a = player.angle - FOV/2 + (i / RAYS) * FOV;
    let d = 0, hitTile = 1;
    while(d < 900){
      d += 5;
      const x = player.x + Math.cos(a) * d;
      const y = player.y + Math.sin(a) * d;
      const mx = Math.floor(x / TILE);
      const my = Math.floor(y / TILE);
      if(map[my] && map[my][mx] !== 1){ hitTile = map[my][mx]; break; }
    }
    const h = 50000 / Math.max(1, d);
    const depth = Math.max(0, 1 - d / 700);

    let r,g,b;
    if(hitTile === 2){ r = 255; g = 100; b = 0; }
    else if(hitTile === 0){ r = 240 * depth + Math.random() * 15; g = 200 * depth + Math.random() * 15; b = 150 * depth + Math.random() * 15; }
    else { r = 20 * depth + Math.random() * 10; g = 30 * depth + Math.random() * 10; b = 80 * depth + Math.random() * 15; }

    const x_pos = i * W / RAYS;
    const y_pos = H/2 - h/2 - player.z;
    const w = W / RAYS + 1;
    ctx.fillStyle = `rgba(${r},${g},${b},0.95)`;
    ctx.fillRect(x_pos, y_pos, w, h);

    if(hitTile === 0 && depth > 0.3){
      const stripeCount = Math.floor(h / 4);
      const waveSpeed = time * 0.15;
      for(let j=0;j<stripeCount;j++){
        const stripe_y = y_pos + j * 4;
        const brightness1 = Math.sin(waveSpeed + j*0.3) * 0.25 + 0.15;
        const brightness2 = Math.sin(waveSpeed*0.7 + j*0.5) * 0.2 + 0.1;
        const combined = brightness1 + brightness2;
        ctx.fillStyle = `rgba(255,220,100,${combined * depth * 0.35})`;
        ctx.fillRect(x_pos, stripe_y, w, 1);
        ctx.fillStyle = `rgba(255,240,150,${combined * depth * 0.25})`;
        ctx.fillRect(x_pos + w*0.25, stripe_y + 1, w*0.5, 1);
      }
      const rayBrightness = Math.sin(waveSpeed*0.5) * 0.1 + 0.15;
      ctx.strokeStyle = `rgba(255,230,150,${rayBrightness*depth})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x_pos + w*0.5, y_pos - 200);
      ctx.lineTo(x_pos + w*0.5, y_pos + h);
      ctx.stroke();
    }
  }

  // Ground
  ctx.fillStyle = "rgba(40,40,60,0.8)";
  ctx.fillRect(0, H/2 + 100, W, H/2 - 100);
  for(let i=0;i<RAYS;i++){
    const x_pos = i * W / RAYS;
    if((Math.floor(i / 10) % 2) === 0){
      ctx.fillStyle = "rgba(50,50,80,0.3)";
      ctx.fillRect(x_pos, H/2 + 100, W / RAYS, H/2 - 100);
    }
  }
}

// ---- FOG / SKY / PARTICLES ----
function drawFog(){
  const fog = ctx.createLinearGradient(0,0,0,H);
  fog.addColorStop(0, "rgba(0,0,0,0)");
  fog.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = fog;
  ctx.fillRect(0,0,W,H);
}

function drawSky(){
  const t = performance.now() / 2000;
  const gradient = ctx.createLinearGradient(0,0,0,H);
  gradient.addColorStop(0, "#0a0e27");
  gradient.addColorStop(0.5, "#1a1f3a");
  gradient.addColorStop(1, "#0d0f1f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0,0,W,H);

  for(let i=0;i<40;i++){
    const sx = (i*150 + t*5) % W;
    const sy = (i*73) % (H*0.6);
    const brightness = 0.2 + Math.sin(t + i) * 0.2;
    ctx.fillStyle = `rgba(255,255,255,${brightness})`;
    ctx.fillRect(sx, sy, 2, 2);
  }

  for(let i=0;i<12;i++){
    const x = ((i*200 + t*50) % (W + 200)) - 100;
    const y = 50 + i*25 + Math.sin(t + i) * 15;
    const radius = 40 + Math.sin(t + i) * 15;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI*2);
    ctx.fill();
  }

  particles.forEach(p => {
    if(p.life > 0){
      ctx.fillStyle = `rgba(${p.color.r},${p.color.g},${p.color.b},${p.life*0.6})`;
      const size = 2 + p.life * 3;
      ctx.fillRect(W/2 + (p.x - player.x) * 10, H/2 - p.z * 10 - size/2, size, size);
    }
  });
}

// ---- UPDATE (delta-ms) ----
let lastTime = performance.now();
function update(delta){
  if(gameState !== "play" || paused) return;
  time = Math.floor((performance.now() - startTime) / 1000);

  // camera smoothing
  camera.x += (player.x - camera.x) * camera.lerp;
  camera.y += (player.y - camera.y) * camera.lerp;
  if(camera.shakeTimer > 0){
    camera.shakeTimer -= delta;
    if(camera.shakeTimer <= 0){ camera.shakeTimer = 0; camera.shake = 0; }
  }

  let nx = player.x, ny = player.y;
  const realSpeed = player.speed + (player.speedBoost > 0 ? 1 : 0);

  if((keys["w"]||keys["s"]||keys["a"]||keys["d"]) && player.onGround && !dead){
    if(time % 2 === 0) playSound(stepSound);
  }
  if(keys["w"]){ nx += Math.cos(player.angle) * realSpeed; ny += Math.sin(player.angle) * realSpeed; }
  if(keys["s"]){ nx -= Math.cos(player.angle) * realSpeed; ny -= Math.sin(player.angle) * realSpeed; }
  if(keys["a"]){ nx += Math.cos(player.angle - Math.PI/2) * realSpeed; ny += Math.sin(player.angle - Math.PI/2) * realSpeed; }
  if(keys["d"]){ nx += Math.cos(player.angle + Math.PI/2) * realSpeed; ny += Math.sin(player.angle + Math.PI/2) * realSpeed; }

  const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
  if(map[ty] && map[ty][tx] !== 0){ player.x = nx; player.y = ny; }

  if(keys[" "] && player.onGround){ player.vz = JUMP_FORCE; player.onGround = false; }
  player.vz -= GRAVITY;
  player.z += player.vz;
  if(player.z <= 0){ player.z = 0; player.vz = 0; player.onGround = true; }

  // powerups / light timer / speed decay
  player.speedBoost = Math.max(0, player.speedBoost - 1);
  if(player.lightTimer > 0){ player.lightTimer = Math.max(0, player.lightTimer - 1); }
  else { player.lightRadius += (Math.min(W,H)/3 - player.lightRadius) * 0.05; }

  // pickups
  for(let i = powerUps.length - 1; i >= 0; i--){
    const pu = powerUps[i];
    if(Math.hypot(pu.x - player.x, pu.y - player.y) < TILE / 2 && player.z === 0){
      if(pu.type === "speed"){ player.speedBoost = 300; }
      else if(pu.type === "health"){ player.health = Math.min(100, player.health + 30); }
      else if(pu.type === "light"){ player.lightRadius = Math.min(Math.max(player.lightRadius, 400), Math.max(W,H)); player.lightTimer = 600; }
      playSound(powerUpSound);
      createParticles(pu.x, pu.y, 15, { r:255, g:215, b:0 });
      score += 50;
      powerUps.splice(i, 1);
    }
  }

  // guards
  for(const g of guards){
    const dx = player.x - g.x, dy = player.y - g.y, dist = Math.hypot(dx, dy);
    const playerTile = map[Math.floor(player.y/TILE)]?.[Math.floor(player.x/TILE)];
    if(dist < g.range * TILE && playerTile === 0){
      g.angle = Math.atan2(dy, dx);
      g.x += Math.cos(g.angle) * g.speed;
      g.y += Math.sin(g.angle) * g.speed;
    }
    if(dist < TILE/2 && player.z === 0){
      player.health = Math.max(0, player.health - 10);
      applyScreenShake(8, 300);
      createParticles(player.x, player.y, 8, { r:255, g:0, b:0 });
      if(keys["e"]){ g.health -= 25; if(g.health <= 0){ score += 200; createParticles(g.x, g.y, 25, { r:255, g:50, b:50 }); } }
    }
  }
  guards = guards.filter(g => g.health > 0);

  // lights motion
  for(const l of lights){ l.x += l.dir * 0.01; if(l.x > 4.2 || l.x < 1.2) l.dir *= -1; }

  updateParticles();

  // tile effect (light damage / shadow heal)
  const tile = map[ty]?.[tx];
  if(tile === 0 && player.z === 0){
    // damage per second: we use time floor, avoid spamming every frame
    if(time % 1 === 0){ player.health = Math.max(0, player.health - 10); applyScreenShake(6, 150); createParticles(player.x, player.y, 5, { r:255, g:200, b:0 }); }
  } else if(tile === 1 && player.z === 0){
    if(time % 2 === 0 && player.health < 100) player.health = Math.min(100, player.health + 3);
  }

  if(player.health <= 0) die();
  if(tile === 2) nextLevel();
}

// ---- DIE / LEVEL FLOW ----
function die(){
  dead = true;
  playSound(deathSound);
  applyScreenShake(14, 800);
  createParticles(player.x, player.y, 20, { r:255, g:50, b:0 });
}
function checkAchievements(){
  const levelTime = time;
  if(levelTime < 30 && !unlockedAchievements.speedrunner){ unlockedAchievements.speedrunner = true; score += achievements.speedrunner.score; }
  if(player.health > 50 && !unlockedAchievements.survivor){ unlockedAchievements.survivor = true; score += achievements.survivor.score; }
  if(player.health === 100 && !unlockedAchievements.perfectRun){ unlockedAchievements.perfectRun = true; score += achievements.perfectRun.score; }
  localStorage.setItem("achievements", JSON.stringify(unlockedAchievements));
}
function nextLevel(){
  checkAchievements();
  playSound(goalSound);
  createParticles(player.x, player.y, 30, { r:255, g:215, b:0 });
  score += 500 + (time * 10);
  levelIndex++;
  if(levelIndex >= levels.length){
    gameState = "end";
    bestTime = Math.min(bestTime || 999, time);
    leaderboard.push({ name: "Player", score, time, date: new Date().toLocaleDateString() });
    leaderboard.sort((a,b) => b.score - a.score);
    leaderboard = leaderboard.slice(0,10);
    localStorage.setItem("leaderboard", JSON.stringify(leaderboard));
    if(!unlockedAchievements.allLevels){ unlockedAchievements.allLevels = true; score += achievements.allLevels.score; localStorage.setItem("achievements", JSON.stringify(unlockedAchievements)); }
    return;
  }
  map = levels[levelIndex];
  resetPlayer();
  difficulty = Math.min(3, Math.floor(levelIndex / 2) + 1);
}

// ---- UI (draw overlays) ----
function drawUI(){
  if(gameState === "settings"){
    ctx.fillStyle = "rgba(0,0,0,0.95)";
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = "white"; ctx.font = "bold 40px Arial"; ctx.textAlign = "center";
    ctx.fillText("⚙️ SETTINGS", W/2, 80);
    ctx.textAlign = "left";
    return;
  }
  if(paused){
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = "white"; ctx.font = "60px Arial"; ctx.textAlign = "center";
    ctx.fillText("PAUSIERT", W/2, H/2 - 40);
    ctx.textAlign = "left";
    return;
  }

  // HUD
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(0,0,300,100);
  ctx.fillStyle = "white"; ctx.font = "bold 20px Arial";
  ctx.fillText("Level: " + (levelIndex + 1), 20, 30);
  ctx.fillText("Time: " + time + "s", 20, 55);
  ctx.fillText("Score: " + score, 20, 80);

  // Health
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(W - 220, 10, 210, 30);
  ctx.fillStyle = player.health > 50 ? "rgba(0,255,0,0.8)" : player.health > 25 ? "rgba(255,165,0,0.8)" : "rgba(255,0,0,0.8)";
  ctx.fillRect(W - 210, 15, player.health * 2, 20);
  ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.strokeRect(W - 210, 15, 200, 20);
  ctx.fillStyle = "white"; ctx.font = "bold 14px Arial"; ctx.fillText("Health: " + Math.ceil(player.health), W - 180, 32);

  // Minimap
  drawMinimap();

  // Mobile buttons
  if(showMobileControls) drawMobileButtons();

  // Dead screen
  if(dead){
    ctx.fillStyle = "rgba(255,0,0,0.7)"; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = "white"; ctx.font = "bold 60px Arial"; ctx.textAlign = "center";
    ctx.fillText("💀 YOU BURNED ☀️", W/2, H/2 - 40);
    ctx.textAlign = "left";
  }
}

// ---- MINIMAP & MOBILE DRAW ----
function drawMinimap(){
  const mmSize = 120; const mmX = W - mmSize - 10; const mmY = 50;
  const scale = mmSize / (Math.max(map[0].length, map.length) * TILE);
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(mmX, mmY, mmSize, mmSize);
  ctx.strokeStyle = "white"; ctx.strokeRect(mmX, mmY, mmSize, mmSize);
  for(let y=0;y<map.length;y++) for(let x=0;x<map[y].length;x++){
    const px = mmX + x * TILE * scale; const py = mmY + y * TILE * scale; const size = TILE * scale;
    ctx.fillStyle = map[y][x] === 1 ? "rgba(100,100,150,0.8)" : map[y][x] === 0 ? "rgba(255,200,100,0.6)" : "rgba(255,100,0,0.9)";
    ctx.fillRect(px, py, size, size);
  }
  ctx.fillStyle = "rgba(0,255,0,0.9)"; ctx.beginPath(); ctx.arc(mmX + player.x * scale, mmY + player.y * scale, 3, 0, Math.PI*2); ctx.fill();
  guards.forEach(g => { ctx.fillStyle = "rgba(255,0,0,0.8)"; ctx.beginPath(); ctx.arc(mmX + g.x * scale, mmY + g.y * scale, 2, 0, Math.PI*2); ctx.fill(); });
}

function drawMobileButtons(){
  updateMobileButtonPositions();
  for(const k in mobileButtons){
    const b = mobileButtons[k];
    ctx.fillStyle = b.pressed ? "rgba(100,255,100,0.8)" : "rgba(100,100,100,0.6)";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = b.pressed ? "rgba(255,255,255,1)" : "rgba(200,200,200,0.6)";
    ctx.lineWidth = 2; ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = "white"; ctx.font = "bold 20px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(b.label, b.x + b.w/2, b.y + b.h/2);
  }
  ctx.textAlign = "left"; ctx.textBaseline = "top";
}

// ---- MAIN DRAW LOOP ----
function drawFrame(){
  const now = performance.now();
  const delta = now - lastTime; lastTime = now;
  update(delta);

  // Clear background
  ctx.clearRect(0, 0, W, H);

  // Apply screen shake transform
  ctx.save();
  if(camera.shakeTimer > 0){
    const s = camera.shake * (camera.shakeTimer / 400);
    const sx = (Math.random() - 0.5) * s;
    const sy = (Math.random() - 0.5) * s;
    ctx.translate(sx, sy);
  }

  // World rendering
  drawSky();
  castRays();

  // Dark overlay + light hole (centered on screen to simulate player's light)
  ctx.save();
  // Draw semi-opaque overlay
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, W, H);

  // Prepare radial gradient: center OPAQUE -> outer TRANSPARENT
  let rad = player.lightRadius;
  rad = Math.max(20, Math.min(rad, Math.max(W, H) * 1.5)); // clamp
  const grad = ctx.createRadialGradient(W/2, H/2, Math.max(1, rad * 0.05), W/2, H/2, rad);
  grad.addColorStop(0, 'rgba(0,0,0,1)'); // opaque center: destination-out will cut here
  grad.addColorStop(1, 'rgba(0,0,0,0)'); // transparent edge

  // Cut hole: destination-out makes destination transparent where source is opaque
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(W/2, H/2, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore(); // restore to before overlay

  // Fog / UI
  drawFog();
  drawUI();

  // Restore camera transform
  ctx.restore();

  requestAnimationFrame(drawFrame);
}
lastTime = performance.now();
requestAnimationFrame(drawFrame);

// ---- INITIAL MENU INTERACTION (mouse click) ----
canvas.addEventListener("click", (e) => {
  if(gameState === "menu"){
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if(x > W/2 - 150 && x < W/2 + 150 && y > H/2 - 50 && y < H/2 + 30){
      initAudio();
      gameState = "play"; startTime = performance.now(); initLevel(); playBackgroundMusic();
    } else if(x > W/2 - 150 && x < W/2 + 150 && y > H/2 + 60 && y < H/2 + 140){
      gameState = "settings";
    }
  } else if(gameState === "end"){
    gameState = "menu"; levelIndex = 0; map = levels[0]; score = 0; difficulty = 1; resetPlayer();
  } else if(dead){
    gameState = "menu"; levelIndex = 0; map = levels[0]; score = 0; difficulty = 1; dead = false; resetPlayer();
  }
});

// ---- SAVE HOOKS ----
window.addEventListener("beforeunload", () => {
  localStorage.setItem("achievements", JSON.stringify(unlockedAchievements));
  localStorage.setItem("leaderboard", JSON.stringify(leaderboard));
});

