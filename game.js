// ---- SKALIERUNG + CANVAS ----
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// CSS-Größen (Display / logical pixels)
let W = innerWidth;
let H = innerHeight;

// Device Pixel Ratio aware resize
function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  // Set CSS size
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  // Set backing store size
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  // Ensure drawing uses CSS pixels by setting transform
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // recompute any UI layout
  updateMobileButtonPositions();
}
addEventListener("resize", resizeCanvas);
resizeCanvas(); // initial

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
let introTime = 0;
let bestTime = 0;
let score = 0;
let health = 100;
let difficulty = 1; // 1=easy, 2=normal, 3=hard
let paused = false;
let soundEnabled = true;
let musicEnabled = true;
let mouseSensitivity = 0.002; // Standard Kamera-Sensibilität
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let showMobileControls = isMobile || window.innerWidth < 768;

// ---- TRANSLATIONS ----
const texts = {
  de: {
    selectLang: "Wähle deine Sprache",
    shadowbound: "SHADOWBOUND",
    storyTitle: "Eine Geschichte der Dunkelheit",
    wakeUp: "Du erwachst in einer Festung aus Licht...",
    sunBurns: "Die Sonne brennt überall.",
    vampireBody: "Dein Vampir-Körper verträgt kein Licht.",
    shadowsSave: "Nur die Schatten können dich retten.",
    hideSun: "Verstecke dich vor dem Sonnenlicht.",
    findSafety: "Finde den Weg zur Sicherheit.",
    survive5: "Du musst durch 5 Level überleben...",
    guards: "Hüte dich vor den Wächtern!",
    guards2: "Sie können dich aus dem Licht aufspüren.",
    ready: "BEREIT?",
    clickStart: "KLICKE ZUM STARTEN",
    youAreVampire: "Du bist ein Vampir 🧛",
    stayInShadows: "Bleib in den Schatten",
    controls: "W/A/S/D - Bewegen | SPACE - Springen | E - Angriff | MAUS - Umsehen"
  },
  en: {
    selectLang: "Select your language",
    shadowbound: "SHADOWBOUND",
    storyTitle: "A Story of Darkness",
    wakeUp: "You wake up in a fortress of light...",
    sunBurns: "The sun burns everywhere.",
    vampireBody: "Your vampire body cannot handle light.",
    shadowsSave: "Only shadows can save you.",
    hideSun: "Hide from the sunlight.",
    findSafety: "Find the way to safety.",
    survive5: "You must survive 5 levels...",
    guards: "Beware of the guardians!",
    guards2: "They can sense you in the light.",
    ready: "READY?",
    clickStart: "CLICK TO START",
    youAreVampire: "You are a vampire 🧛",
    stayInShadows: "Stay in the shadows",
    controls: "W/A/S/D - Move | SPACE - Jump | E - Attack | MOUSE - Look Around"
  }
};

function t(key) {
  return texts[language][key] || key;
}

// ---- ACHIEVEMENTS ----
const achievements = {
  speedrunner: { name: "🏃 Speedrunner", desc: "Level in < 30s", unlocked: false, score: 100 },
  survivor: { name: "💪 Survivor", desc: "Mit > 50% Health gewinnen", unlocked: false, score: 150 },
  guardianSlayer: { name: "⚔️ Guardian Slayer", desc: "3+ Wächter besiegen", unlocked: false, score: 200 },
  perfectRun: { name: "✨ Perfect Run", desc: "Level ohne Schaden", unlocked: false, score: 300 },
  allLevels: { name: "👑 Master Vampire", desc: "Alle Level absolvieren", unlocked: false, score: 500 }
};

let unlockedAchievements = JSON.parse(localStorage.getItem("achievements")) || {};
let leaderboard = JSON.parse(localStorage.getItem("leaderboard")) || [];

// ---- LEVELS (0=licht, 1=schatten, 2=ziel, 3=power-up) ----
const levels = [
  // Level 1 - Easy
  [
    [1,1,1,1,0],
    [0,1,1,1,2],
    [0,0,1,1,0]
  ],
  // Level 2 - Medium
  [
    [1,1,1,1,1,2],
    [0,0,1,1,1,0],
    [0,0,1,0,0,0]
  ],
  // Level 3 - Hard (Labyrinth)
  [
    [1,1,1,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,1,0],
    [0,0,1,0,0,0,1,0,0,0],
    [1,1,1,0,1,1,1,1,1,2],
    [1,0,0,0,1,0,0,0,1,0]
  ],
  // Level 4 - Very Hard (Großes Labyrinth)
  [
    [1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,1,0,0,0,1,0,0,1,0,0,0,1,0],
    [0,1,1,1,1,1,1,1,0,1,1,1,1,1,0],
    [0,1,0,0,0,0,0,1,0,0,0,0,0,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,2]
  ],
  // Level 5 - Insane (Chaos Labyrinth - mit sicherem Spawn bei [2,1])
  [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0],
    [1,1,1,1,1,1,1,1,0,1,1,1,1,1,0,1,1,1,1,0],
    [0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,1,0],
    [0,1,1,1,0,1,1,1,1,1,0,1,1,1,0,1,1,1,1,0],
    [0,1,0,0,0,1,0,0,0,1,0,1,0,0,0,0,0,1,0,0],
    [0,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,0,1,1,1],
    [0,0,0,0,1,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0],
    [1,1,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [1,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,1,0,0],
    [1,1,1,1,1,0,1,1,1,1,0,1,1,1,1,1,1,1,0,2]
  ]
];
map = levels[levelIndex];

// ---- PLAYER ----
const player = { x: 2.5*TILE, y: 1.5*TILE, z:0, vz:0, angle:0, speed:2, onGround:true, health:100, speedBoost:0, lightRadius: 220, lightTimer: 0 };

// ---- CAMERA & SCREEN EFFECTS ----
const camera = { x: player.x, y: player.y, lerp: 0.12, shake: 0, shakeTimer: 0 };
function applyScreenShake(intensity = 8, duration = 300) {
  camera.shake = intensity;
  camera.shakeTimer = duration;
}

// ---- WÄCHTER/GEGNER ----
let guards = [];

// ---- POWER-UPS ----
let powerUps = [];

// ---- PARTIKEL ----
let particles = [];

// ---- LIGHTS ----
let lights = [{ x:3, y:0, dir:1 }];

// ---- SOUNDS (mit Fehlerbehandlung) ----
const stepSound = new Audio("assets/sounds/step.mp3");
const deathSound = new Audio("assets/sounds/death.mp3");
const goalSound = new Audio("assets/sounds/goal.mp3");
const hitSound = new Audio("assets/sounds/hit.mp3");
const powerUpSound = new Audio("assets/sounds/powerup.mp3");

function playSound(sound) {
  if(soundEnabled) try { sound.play().catch(e => {}); } catch(e) {}
}

// ---- BACKGROUND MUSIC SYSTEM ----
let audioContext;
let oscillator;
let gainNode;

function initAudio() {
  if(!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);
    gainNode.gain.value = 0.1;
  }
}

function playBackgroundMusic() {
  if(!musicEnabled || !audioContext) return;
  try {
    if(oscillator) oscillator.stop();
    oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(50, audioContext.currentTime);
    oscillator.frequency.linearRampToValueAtTime(60, audioContext.currentTime + 2);
    oscillator.connect(gainNode);
    oscillator.start(audioContext.currentTime);
  } catch(e) {}
}

function stopBackgroundMusic() {
  if(oscillator) try { oscillator.stop(); } catch(e) {}
}

// ---- INPUT ----
const keys = {};
addEventListener("keydown", e => {
  if(gameState === "play") keys[e.key.toLowerCase()] = true;
  if(e.key.toLowerCase() === "p") paused = gameState === "play" ? !paused : false;
  if(e.key.toLowerCase() === "m") { soundEnabled = !soundEnabled; }
  if(e.key.toLowerCase() === "s" && gameState === "play") gameState = "settings";
  if(e.key.toLowerCase() === "s" && gameState === "settings") gameState = "play";
});
addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

// ---- TOUCH CONTROLS ----
let touchStart = { x: 0, y: 0 };
let touchCurrent = { x: 0, y: 0 };
const touchDeadzone = 50;

canvas.addEventListener("touchstart", e => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, false);

canvas.addEventListener("touchmove", e => {
  e.preventDefault();
  touchCurrent = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if(document.pointerLockElement !== canvas) {
    const dx = touchCurrent.x - touchStart.x;
    const dy = touchCurrent.y - touchStart.y;
    // Rotate view
    if(Math.abs(dx) > touchDeadzone) {
      player.angle += dx * 0.01;
      touchStart.x = touchCurrent.x;
    }
  }
}, false);

// ---- MOBILE BUTTONS ----
let mobileButtons = {
  forward: { x: 0, y: 0, w: 60, h: 60, pressed: false, label: "↑" },
  backward: { x: 0, y: 0, w: 60, h: 60, pressed: false, label: "↓" },
  left: { x: 0, y: 0, w: 60, h: 60, pressed: false, label: "←" },
  right: { x: 0, y: 0, w: 60, h: 60, pressed: false, label: "→" },
  jump: { x: 0, y: 0, w: 60, h: 60, pressed: false, label: "⬆" },
  attack: { x: 0, y: 0, w: 60, h: 60, pressed: false, label: "⚔" },
  pause: { x: 0, y: 0, w: 60, h: 60, pressed: false, label: "⏸" }
};

function updateMobileButtonPositions() {
  mobileButtons.forward = { ...mobileButtons.forward, x: W/2 - 80, y: H - 140 };
  mobileButtons.backward = { ...mobileButtons.backward, x: W/2 - 80, y: H - 60 };
  mobileButtons.left = { ...mobileButtons.left, x: W/2 - 160, y: H - 100 };
  mobileButtons.right = { ...mobileButtons.right, x: W/2, y: H - 100 };
  mobileButtons.jump = { ...mobileButtons.jump, x: W - 100, y: H - 140 };
  mobileButtons.attack = { ...mobileButtons.attack, x: W - 100, y: H - 60 };
  mobileButtons.pause = { ...mobileButtons.pause, x: 20, y: H - 100 };
}
updateMobileButtonPositions();

canvas.addEventListener("touchstart", e => {
  if(!showMobileControls) return;
  const touch = e.touches[0];
  const x = touch.clientX;
  const y = touch.clientY;
  
  Object.keys(mobileButtons).forEach(btn => {
    const b = mobileButtons[btn];
    if(x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) {
      b.pressed = true;
      if(btn === "pause") paused = gameState === "play" ? !paused : false;
      if(btn === "forward") keys["w"] = true;
      if(btn === "backward") keys["s"] = true;
      if(btn === "left") keys["a"] = true;
      if(btn === "right") keys["d"] = true;
      if(btn === "jump") keys[" "] = true;
      if(btn === "attack") keys["e"] = true;
    }
  });
}, false);

canvas.addEventListener("touchend", e => {
  if(!showMobileControls) return;
  Object.keys(mobileButtons).forEach(btn => {
    mobileButtons[btn].pressed = false;
  });
  keys["w"] = false;
  keys["s"] = false;
  keys["a"] = false;
  keys["d"] = false;
  keys[" "] = false;
  keys["e"] = false;
}, false);

canvas.onclick = (e) => {
  if(gameState==="menu"){ 
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Play Button
    if(x > W/2 - 150 && x < W/2 + 150 && y > H/2 - 50 && y < H/2 + 30) {
      initAudio();
      gameState="play"; 
      startTime=performance.now(); 
      initLevel(); 
      playBackgroundMusic();
      window.menuStartTime = null;
    }
    // Settings Button
    else if(x > W/2 - 150 && x < W/2 + 150 && y > H/2 + 60 && y < H/2 + 140) {
      gameState = "settings";
    }
  }
  else if(gameState === "settings") {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Deutsch Language Button
    if(x > W/2 - 300 && x < W/2 - 180 && y > 200 && y < 250) {
      language = "de";
      localStorage.setItem("shadowbound_lang", "de");
    }
    // English Language Button
    else if(x > W/2 + 180 && x < W/2 + 300 && y > 200 && y < 250) {
      language = "en";
      localStorage.setItem("shadowbound_lang", "en");
    }
    // Back Button
    else if(x > W/2 - 150 && x < W/2 + 150 && y > H - 100 && y < H - 40) {
      gameState = "menu";
    }
  }
  else if(gameState==="end"){ 
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if(x > W/2 - 150 && x < W/2 + 150 && y > H/2 + 150 && y < H/2 + 220) {
      gameState="menu"; 
      levelIndex=0; 
      map=levels[0]; 
      score=0;
      difficulty=1;
      resetPlayer();
      window.menuStartTime = null;
    }
  }
  else if(dead) {
    // Klick auf Game Over Screen: zurück zum Menu
    gameState = "menu";
    levelIndex = 0;
    map = levels[0];
    score = 0;
    difficulty = 1;
    dead = false;
    resetPlayer();
    window.menuStartTime = null;
  }
  canvas.requestPointerLock();
};
addEventListener("mousemove", e => {
  if(document.pointerLockElement===canvas) player.angle += e.movementX*mouseSensitivity;
});

// ---- INIT LEVEL ----
function initLevel(){
  guards = [];
  powerUps = [];
  particles = [];
  player.health = 100;
  player.speedBoost = 0;
  player.lightRadius = 220;
  player.lightTimer = 0;
  
  // Spawn Wächter basierend auf Schwierigkeit
  const guardCount = 1 + difficulty;
  for(let i=0; i<guardCount; i++){
    guards.push({
      x: Math.random()*map[0].length*TILE,
      y: Math.random()*map.length*TILE,
      health: 50,
      speed: 0.5 + difficulty*0.3,
      angle: Math.random()*Math.PI*2,
      range: 3
    });
  }
}

// ---- PARTIKEL SYSTEM ----
function createParticles(x, y, count, color){
  for(let i=0; i<count; i++){
    particles.push({
      x: x, y: y, z: 0,
      vx: (Math.random()-0.5)*4,
      vy: (Math.random()-0.5)*4,
      vz: Math.random()*3,
      life: 1,
      color: color
    });
  }
}

function updateParticles(){
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.z += p.vz;
    p.vz -= 0.2;
    p.life -= 0.02;
  });
}
const FOV = Math.PI/3;
const RAYS = 260;

function castRays(){
  for(let i=0;i<RAYS;i++){
    const a = player.angle - FOV/2 + (i/RAYS)*FOV;
    let d=0; let hitTile=1;
    while(d<900){
      d+=5;
      const x = player.x + Math.cos(a)*d;
      const y = player.y + Math.sin(a)*d;
      const mx = Math.floor(x/TILE);
      const my = Math.floor(y/TILE);
      if(map[my] && map[my][mx]!==1){ hitTile=map[my][mx]; break; }
    }
    const h = 50000/d; // Erhöhte Wandhöhe
    const depth = Math.max(0,1-d/700);

    let r,g,b;
    if(hitTile===2){ r=255; g=100; b=0; } // Ziel orange
    else if(hitTile===0){ // Licht mit Lichtstrahlen-Effekt
      r = 240*depth + Math.random()*15;
      g = 200*depth + Math.random()*15;
      b = 150*depth + Math.random()*15;
    } else { // Schatten
      r = 20*depth + Math.random()*10;
      g = 30*depth + Math.random()*10;
      b = 80*depth + Math.random()*15;
    }

    // Screen-Shake Effekt will be applied globally via ctx.translate in draw()
    const x_pos = i*W/RAYS;
    const y_pos = H/2 - h/2 - player.z;
    const w = W/RAYS+1;
    
    // Zeichne Wand
    ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
    ctx.fillRect(x_pos, y_pos, w, h);
    
    // Lichtstrahlen-Effekt auf Lichtwänden (von oben nach unten)
    if(hitTile === 0 && depth > 0.3) {
      const stripeCount = Math.floor(h/4); // Mehr Streifen für flüssigere Animation
      const waveSpeed = time * 0.15; // Schnellere Wellen-Animation
      
      for(let j = 0; j < stripeCount; j++) {
        const stripe_y = y_pos + j*4;
        // Mehrschichtige Wellen für flüssige Bewegung
        const brightness1 = Math.sin(waveSpeed + j*0.3) * 0.25 + 0.15;
        const brightness2 = Math.sin(waveSpeed*0.7 + j*0.5) * 0.2 + 0.1;
        const combined = brightness1 + brightness2;
        
        ctx.fillStyle = `rgba(255,220,100,${combined*depth*0.35})`;
        ctx.fillRect(x_pos, stripe_y, w, 1);
        ctx.fillStyle = `rgba(255,240,150,${combined*depth*0.25})`;
        ctx.fillRect(x_pos + w*0.25, stripe_y + 1, w*0.5, 1);
      }
      
      // Vertikale Lichtstreifen mit sanfter Animation
      const rayBrightness = Math.sin(waveSpeed*0.5) * 0.1 + 0.15;
      ctx.strokeStyle = `rgba(255,230,150,${rayBrightness*depth})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x_pos + w*0.5, y_pos - 200);
      ctx.lineTo(x_pos + w*0.5, y_pos + h);
      ctx.stroke();
    }
  }
  
  // BODEN zeichnen
  ctx.fillStyle = "rgba(40,40,60,0.8)";
  ctx.fillRect(0, H/2 + 100, W, H/2 - 100);
  
  // Boden Pattern
  for(let i = 0; i < RAYS; i++) {
    const x_pos = i*W/RAYS;
    const pattern = Math.floor(i/10) % 2;
    if(pattern === 0) {
      ctx.fillStyle = "rgba(50,50,80,0.3)";
      ctx.fillRect(x_pos, H/2 + 100, W/RAYS, H/2 - 100);
    }
  }
}

// ---- FOG ----
function drawFog(){
  const fog = ctx.createLinearGradient(0,0,0,H);
  fog.addColorStop(0,"rgba(0,0,0,0)");
  fog.addColorStop(1,"rgba(0,0,0,0.5)");
  ctx.fillStyle = fog;
  ctx.fillRect(0,0,W,H);
}

// ---- SKY + WOLKEN + LIGHTS ----
function drawSky(){
  const t = performance.now()/2000;
  const gradient = ctx.createLinearGradient(0,0,0,H);
  gradient.addColorStop(0,"#0a0e27"); // dunkelblau oben
  gradient.addColorStop(0.5,"#1a1f3a");
  gradient.addColorStop(1,"#0d0f1f"); // fast schwarz unten
  ctx.fillStyle = gradient;
  ctx.fillRect(0,0,W,H);

  // Sterne
  for(let i=0;i<50;i++){
    const sx = (i*150 + t*5) % W;
    const sy = (i*73) % (H*0.6);
    const brightness = 0.3 + Math.sin(t + i)*0.2;
    ctx.fillStyle = `rgba(255,255,255,${brightness})`;
    ctx.fillRect(sx, sy, 2, 2);
  }

  // Wolken
  for(let i=0;i<15;i++){
    const x = ((i*200 + t*50)%(W+200))-100;
    const y = 50 + i*25 + Math.sin(t+i)*15;
    const radius = 40 + Math.sin(t+i)*15;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.arc(x,y,radius,0,Math.PI*2);
    ctx.fill();
  }

  // Partikel zeichnen
  particles.forEach(p => {
    if(p.life > 0){
      ctx.fillStyle = `rgba(${p.color.r},${p.color.g},${p.color.b},${p.life*0.6})`;
      const size = 2 + p.life*3;
      ctx.fillRect(W/2 + (p.x-player.x)*10, H/2 - p.z*10 - size/2, size, size);
    }
  });
}


// ---- UPDATE ----
function update(delta){
  if(gameState!=="play" || paused) return;
  if(gameState === "settings") return;
  time = Math.floor((performance.now()-startTime)/1000);

  // Camera smoothing (keeps internal camera x/y near player for potential 2D overlays)
  camera.x += (player.x - camera.x) * camera.lerp;
  camera.y += (player.y - camera.y) * camera.lerp;
  if(camera.shakeTimer > 0) {
    camera.shakeTimer -= delta;
    if(camera.shakeTimer < 0) { camera.shakeTimer = 0; camera.shake = 0; }
  }

  let nx=player.x, ny=player.y;
  const realSpeed = player.speed + (player.speedBoost > 0 ? 1 : 0);
  
  if((keys["w"]||keys["s"]||keys["a"]||keys["d"]) && player.onGround && !dead){ if(time%2===0) playSound(stepSound); }

  // Forward/Backward
  if(keys["w"]){ nx += Math.cos(player.angle)*realSpeed; ny += Math.sin(player.angle)*realSpeed; }
  if(keys["s"]){ nx -= Math.cos(player.angle)*realSpeed; ny -= Math.sin(player.angle)*realSpeed; }

  // Strafe Left/Right
  if(keys["a"]){ nx += Math.cos(player.angle - Math.PI/2)*realSpeed; ny += Math.sin(player.angle - Math.PI/2)*realSpeed; }
  if(keys["d"]){ nx += Math.cos(player.angle + Math.PI/2)*realSpeed; ny += Math.sin(player.angle + Math.PI/2)*realSpeed; }

  const tx=Math.floor(nx/TILE);
  const ty=Math.floor(ny/TILE);
  if(map[ty] && map[ty][tx]!==0){ player.x=nx; player.y=ny; }

  if(keys[" "] && player.onGround){ player.vz=JUMP_FORCE; player.onGround=false; }
  player.vz -= GRAVITY;
  player.z += player.vz;
  if(player.z<=0){ player.z=0; player.vz=0; player.onGround=true; }

  // Power-ups Update
  player.speedBoost = Math.max(0, player.speedBoost - 1);

  // Light powerup duration decay
  if(player.lightTimer > 0) {
    player.lightTimer = Math.max(0, player.lightTimer - 1);
    if(player.lightTimer === 0) {
      // smooth return to default radius
      player.lightRadius = Math.max(220, player.lightRadius - 1);
    }
  } else {
    // keep radius near default
    player.lightRadius += (220 - player.lightRadius) * 0.05;
  }

  // Power-ups Pickup
  powerUps = powerUps.filter(pu => {
    if(Math.hypot(pu.x-player.x, pu.y-player.y) < TILE/2 && player.z === 0){
      if(pu.type === "speed"){ player.speedBoost = 300; }
      else if(pu.type === "health"){ player.health = Math.min(100, player.health+30); }
      else if(pu.type === "light"){ player.lightRadius = 400; player.lightTimer = 600; }
      playSound(powerUpSound);
      createParticles(pu.x, pu.y, 15, {r:255,g:215,b:0});
      score += 50;
      return false;
    }
    return true;
  });

  // Wächter Update
  guards.forEach(g => {
    const dx = player.x - g.x;
    const dy = player.y - g.y;
    const dist = Math.hypot(dx, dy);
    
    if(dist < g.range*TILE){
      const tx = Math.floor(g.x/TILE);
      const ty = Math.floor(g.y/TILE);
      const playerTile = map[Math.floor(player.y/TILE)]?.[Math.floor(player.x/TILE)];
      
      // Wächter verfolgt wenn Spieler im Licht
      if(playerTile === 0){
        g.angle = Math.atan2(dy, dx);
        g.x += Math.cos(g.angle) * g.speed;
        g.y += Math.sin(g.angle) * g.speed;
      }

      // Kollusionserkennung
      if(dist < TILE/2 && player.z === 0){
        player.health -= 10;
        applyScreenShake(8, 300);
        createParticles(player.x, player.y, 10, {r:255,g:0,b:0});
        if(keys["e"]) { // Spieler kann mit E angreifen
          g.health -= 25;
          if(g.health <= 0) {
            score += 200;
            // slow-motion hook (not full-time-scaling, visual moment)
            // TODO: integrate real time-scaling
            createParticles(g.x, g.y, 25, {r:255,g:50,b:50});
          }
        }
      }
    }
  });
  guards = guards.filter(g => g.health > 0);

  // moving lights
  lights.forEach(l => {
    l.x += l.dir*0.01;
    if (l.x>4.2 || l.x<1.2) l.dir*=-1;
  });

  updateParticles();

  // TILE CHECK
  const tile = map[ty]?.[tx];
  
  // Licht-Schaden: Schneller Schaden wenn im Licht
  if (tile===0 && player.z===0) { 
    if(time % 1 === 0) { // Jede Sekunde 10 Schaden
      player.health = Math.max(0, player.health - 10);
      applyScreenShake(6, 150);
      createParticles(player.x, player.y, 5, {r:255,g:200,b:0});
    }
  } 
  // Schatten-Heilung
  else if(tile===1 && player.z===0) {
    // Im Schatten - langsam regenerieren (alle 2 Sekunden +3 Health)
    if(time % 2 === 0 && player.health < 100) {
      player.health = Math.min(100, player.health + 3);
    }
  }
  
  if(player.health <= 0) {
    die();
  }
  if (tile===2) {
    nextLevel();
  }
}

// ---- DIE & LEVEL ----
function die(){ 
  dead=true; 
  playSound(deathSound);
  applyScreenShake(14, 800);
  createParticles(player.x, player.y, 20, {r:255,g:50,b:0}); 
}

function checkAchievements() {
  const levelTime = time;
  
  // Speedrunner: < 30s
  if(levelTime < 30 && !unlockedAchievements.speedrunner) {
    unlockedAchievements.speedrunner = true;
    score += achievements.speedrunner.score;
  }
  
  // Survivor: > 50% health
  if(player.health > 50 && !unlockedAchievements.survivor) {
    unlockedAchievements.survivor = true;
    score += achievements.survivor.score;
  }
  
  // Perfect Run: no damage
  if(player.health === 100 && !unlockedAchievements.perfectRun) {
    unlockedAchievements.perfectRun = true;
    score += achievements.perfectRun.score;
  }
  
  localStorage.setItem("achievements", JSON.stringify(unlockedAchievements));
}

function nextLevel(){
  checkAchievements();
  playSound(goalSound);
  createParticles(player.x, player.y, 30, {r:255,g:215,b:0});
  score += 500 + (time * 10);
  levelIndex++;
  if(levelIndex>=levels.length){ 
    gameState="end"; 
    bestTime=Math.min(bestTime||999,time);
    
    // Leaderboard Update
    leaderboard.push({ name: "Player", score: score, time: time, date: new Date().toLocaleDateString() });
    leaderboard.sort((a,b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 10);
    localStorage.setItem("leaderboard", JSON.stringify(leaderboard));
    
    // Master Vampire Achievement
    if(!unlockedAchievements.allLevels) {
      unlockedAchievements.allLevels = true;
      score += achievements.allLevels.score;
      localStorage.setItem("achievements", JSON.stringify(unlockedAchievements));
    }
    
    return; 
  }
  map=levels[levelIndex];
  resetPlayer();
  difficulty = Math.min(3, Math.floor(levelIndex/2) + 1);
}

function resetPlayer(){ 
  player.x=2.5*TILE; 
  player.y=1.5*TILE; 
  player.z=0; 
  player.vz=0; 
  player.health=100;
  dead=false; 
  startTime=performance.now(); 
  player.lightRadius = 220;
  player.lightTimer = 0;
}

// ---- UI ----
function drawUI(){
  // Settings Menu
  if(gameState === "settings") {
    ctx.fillStyle = "rgba(0,0,0,0.95)";
    ctx.fillRect(0,0,W,H);
    
    // Titel
    ctx.fillStyle = "white";
    ctx.font = "bold 50px Arial";
    ctx.textAlign = "center";
    ctx.fillText("⚙️ SETTINGS", W/2, 80);
    
    // Language Section
    ctx.font = "28px Arial";
    ctx.fillStyle = "#FFD700";
    ctx.fillText("🌐 Language", W/2, 160);
    
    ctx.font = "22px Arial";
    ctx.fillStyle = "white";
    
    // Deutsch Button
    ctx.fillStyle = language === "de" ? "rgba(100,200,100,0.8)" : "rgba(100,100,150,0.6)";
    ctx.fillRect(W/2 - 300, 200, 120, 50);
    ctx.strokeStyle = language === "de" ? "rgba(200,255,200,1)" : "rgba(150,150,200,1)";
    ctx.lineWidth = 3;
    ctx.strokeRect(W/2 - 300, 200, 120, 50);
    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🇩🇪 Deutsch", W/2 - 240, 230);
    
    // English Button
    ctx.fillStyle = language === "en" ? "rgba(100,200,100,0.8)" : "rgba(100,100,150,0.6)";
    ctx.fillRect(W/2 + 180, 200, 120, 50);
    ctx.strokeStyle = language === "en" ? "rgba(200,255,200,1)" : "rgba(150,150,200,1)";
    ctx.lineWidth = 3;
    ctx.strokeRect(W/2 + 180, 200, 120, 50);
    ctx.fillStyle = "white";
    ctx.fillText("🇬🇧 English", W/2 + 240, 230);
    
    // Sound Section
    ctx.font = "28px Arial";
    ctx.fillStyle = "#FFD700";
    ctx.textAlign = "center";
    ctx.fillText("🔊 Sound", W/2, 320);
    
    ctx.font = "22px Arial";
    ctx.fillStyle = soundEnabled ? "rgba(0,255,0,0.8)" : "rgba(255,0,0,0.8)";
    ctx.fillText(soundEnabled ? "✓ ON" : "✗ OFF", W/2, 365);
    
    // Music Section
    ctx.fillStyle = "#FFD700";
    ctx.font = "28px Arial";
    ctx.fillText("🎵 Music", W/2, 430);
    
    ctx.font = "22px Arial";
    ctx.fillStyle = musicEnabled ? "rgba(0,255,0,0.8)" : "rgba(255,0,0,0.8)";
    ctx.fillText(musicEnabled ? "✓ ON" : "✗ OFF", W/2, 475);
    
    // Controls Hint
    ctx.font = "18px Arial";
    ctx.fillStyle = "rgba(200,200,200,0.8)";
    ctx.fillText("M = Sound Toggle | U = Music Toggle | S = Close | Click Language to Change", W/2, 540);
    
    // Back Button
    ctx.fillStyle = "rgba(200,100,100,0.7)";
    ctx.fillRect(W/2 - 150, H - 100, 300, 60);
    ctx.strokeStyle = "rgba(255,150,150,1)";
    ctx.lineWidth = 3;
    ctx.strokeRect(W/2 - 150, H - 100, 300, 60);
    ctx.fillStyle = "white";
    ctx.font = "bold 24px Arial";
    ctx.fillText("⬅ BACK TO MENU (S)", W/2, H - 65);
    
    ctx.textAlign = "left";
    return;
  }

  // Pause Overlay
  if(paused) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = "white";
    ctx.font = "60px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PAUSIERT", W/2, H/2-40);
    ctx.font = "24px Arial";
    ctx.fillText("P = Fortsetzen | M = Sound | S = Einstellungen", W/2, H/2+40);
    ctx.textAlign = "left";
    return;
  }

  // HUD Background
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(0, 0, 300, 100);
  
  // Text
  ctx.fillStyle="white"; 
  ctx.font="bold 20px Arial";
  ctx.fillText("Level: "+(levelIndex+1), 20, 30);
  ctx.fillText("Time: "+time+"s", 20, 55);
  ctx.fillText("Score: "+score, 20, 80);

  // Health Bar
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(W-220, 10, 210, 30);
  ctx.fillStyle = player.health > 50 ? "rgba(0,255,0,0.8)" : player.health > 25 ? "rgba(255,165,0,0.8)" : "rgba(255,0,0,0.8)";
  ctx.fillRect(W-210, 15, player.health*2, 20);
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.strokeRect(W-210, 15, 200, 20);
  ctx.fillStyle = "white";
  ctx.font = "bold 14px Arial";
  ctx.fillText("Health: "+Math.ceil(player.health), W-180, 32);

  // Schwierigkeitsanzeige
  ctx.fillStyle="white";
  ctx.font="14px Arial";
  const diffText = difficulty === 1 ? "EASY" : difficulty === 2 ? "NORMAL" : "HARD";
  ctx.fillText("Difficulty: "+diffText, 20, 105);

  // Speed Boost Anzeige
  if(player.speedBoost > 0){
    ctx.fillStyle = `rgba(0,255,255,${player.speedBoost/300})`;
    ctx.fillRect(0, H-10, (player.speedBoost/300)*100, 10);
  }

  // Minimap
  drawMinimap();

  // Mobile Buttons zeichnen
  if(showMobileControls) {
    drawMobileButtons();
  }

  // Dead Screen
  if(dead){ 
    ctx.fillStyle="rgba(255,0,0,0.7)"; 
    ctx.fillRect(0,0,W,H);
    
    ctx.fillStyle="rgba(255,50,50,1)"; 
    ctx.font="bold 80px Arial";
    ctx.textAlign = "center";
    ctx.fillText("💀 YOU BURNED ☀️ 💀", W/2, H/2-80);
    
    ctx.fillStyle="white";
    ctx.font="40px Arial"; 
    ctx.fillText("GAME OVER", W/2, H/2+20);
    
    ctx.fillStyle="rgba(255,255,100,0.9)";
    ctx.font="30px Arial"; 
    ctx.fillText("Final Score: "+score, W/2, H/2+100);
    
    ctx.fillStyle="rgba(100,255,100,0.8)";
    ctx.font="24px Arial"; 
    ctx.fillText("Press R to Retry Level | CLICK for Menu", W/2, H/2+160); 
    
    if(keys["r"]) {
      // Nur das Level neu starten - Score und Difficulty bleiben!
      dead = false;
      player.health = 100;
      player.x = 2.5*TILE;
      player.y = 1.5*TILE;
      player.z = 0;
      player.vz = 0;
      player.speedBoost = 0;
      startTime = performance.now();
      guards = [];
      particles = [];
      powerUps = [];
      const guardCount = 1 + difficulty;
      for(let i=0; i<guardCount; i++){
        guards.push({
          x: Math.random()*map[0].length*TILE,
          y: Math.random()*map.length*TILE,
          health: 50,
          speed: 0.5 + difficulty*0.3,
          angle: Math.random()*Math.PI*2,
          range: 3
        });
      }
    }
  }
}

// ---- MINIMAP ----
function drawMinimap(){
  const mmSize = 120;
  const mmX = W - mmSize - 10;
  const mmY = 50;
  const scale = mmSize / (Math.max(map[0].length, map.length) * TILE);

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(mmX, mmY, mmSize, mmSize);
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1;
  ctx.strokeRect(mmX, mmY, mmSize, mmSize);

  // Tiles
  for(let y=0; y<map.length; y++){
    for(let x=0; x<map[y].length; x++){
      const px = mmX + x*TILE*scale;
      const py = mmY + y*TILE*scale;
      const size = TILE*scale;

      if(map[y][x] === 1){ // Schatten
        ctx.fillStyle = "rgba(100,100,150,0.8)";
      } else if(map[y][x] === 0){ // Licht
        ctx.fillStyle = "rgba(255,200,100,0.6)";
      } else if(map[y][x] === 2){ // Ziel
        ctx.fillStyle = "rgba(255,100,0,0.9)";
      }
      ctx.fillRect(px, py, size, size);
    }
  }

  // Spieler
  ctx.fillStyle = "rgba(0,255,0,0.9)";
  ctx.beginPath();
  ctx.arc(mmX + player.x*scale, mmY + player.y*scale, 3, 0, Math.PI*2);
  ctx.fill();

  // Wächter
  guards.forEach(g => {
    ctx.fillStyle = "rgba(255,0,0,0.8)";
    ctx.beginPath();
    ctx.arc(mmX + g.x*scale, mmY + g.y*scale, 2, 0, Math.PI*2);
    ctx.fill();
  });
}

// ---- MOBILE BUTTONS DRAWING ----
function drawMobileButtons() {
  updateMobileButtonPositions();
  
  Object.keys(mobileButtons).forEach(btn => {
    const b = mobileButtons[btn];
    
    // Button Background
    ctx.fillStyle = b.pressed ? "rgba(100,255,100,0.8)" : "rgba(100,100,100,0.6)";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    
    // Button Border
    ctx.strokeStyle = b.pressed ? "rgba(255,255,255,1)" : "rgba(200,200,200,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    
    // Button Label
    ctx.fillStyle = "white";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.label, b.x + b.w/2, b.y + b.h/2);
  });
  
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

// ---- DRAW ----
let lastFrame = performance.now();
function draw(){
  const now = performance.now();
  const delta = now - lastFrame;
  lastFrame = now;

  // update logic with delta (ms)
  update(delta);

  // Save and apply screen shake
  ctx.save();
  // Random shake while active
  if(camera.shakeTimer > 0) {
    const s = camera.shake * (camera.shakeTimer / 400);
    const sx = (Math.random()-0.5) * s;
    const sy = (Math.random()-0.5) * s;
    ctx.translate(sx, sy);
  }

  // Settings Menu Handler
  if(gameState === "settings") {
    if(keys["q"]) mouseSensitivity = Math.max(0.0001, mouseSensitivity - 0.0001);
    if(keys["e"]) mouseSensitivity = Math.min(0.01, mouseSensitivity + 0.0001);
    if(keys["m"]) soundEnabled = !soundEnabled;
    if(keys["u"]) musicEnabled = !musicEnabled;
  }
  
  if(gameState === "language") {
    // Sprachauswahl Screen
    const gradient = ctx.createLinearGradient(0,0,0,H);
    gradient.addColorStop(0,"#0a0e27");
    gradient.addColorStop(1,"#1a1f3a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0,W,H);
    
    // Titel
    ctx.fillStyle = "white";
    ctx.font = "60px Arial";
    ctx.textAlign = "center";
    ctx.fillText(t("selectLang"), W/2, H/2 - 100);
    
    // Deutsch Button
    ctx.fillStyle = "rgba(100,150,255,0.7)";
    ctx.fillRect(W/2 - 180, H/2 - 20, 150, 80);
    ctx.strokeStyle = "rgba(150,200,255,1)";
    ctx.lineWidth = 3;
    ctx.strokeRect(W/2 - 180, H/2 - 20, 150, 80);
    ctx.fillStyle = "white";
    ctx.font = "30px Arial";
    ctx.fillText("🇩🇪 Deutsch", W/2 - 105, H/2 + 35);
    
    // English Button
    ctx.fillStyle = "rgba(150,100,255,0.7)";
    ctx.fillRect(W/2 + 30, H/2 - 20, 150, 80);
    ctx.strokeStyle = "rgba(200,150,255,1)";
    ctx.lineWidth = 3;
    ctx.strokeRect(W/2 + 30, H/2 - 20, 150, 80);
    ctx.fillStyle = "white";
    ctx.fillText("🇬🇧 English", W/2 + 105, H/2 + 35);
    
    ctx.textAlign = "left";
    ctx.restore();
    requestAnimationFrame(draw);
    return;
  }
  
  if(gameState==="menu"){
    // Premium Start Menu
    const gradient = ctx.createLinearGradient(0,0,0,H);
    gradient.addColorStop(0,"#0a0e27");
    gradient.addColorStop(0.5,"#16213e");
    gradient.addColorStop(1,"#0f3460");
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0,W,H);
    
    // Animated Background Effect
    const t = performance.now()/1000;
    for(let i = 0; i < 5; i++) {
      const waveY = H * 0.3 + Math.sin(t + i)*30;
      ctx.fillStyle = `rgba(255,100,100,${0.05 - i*0.01})`;
      ctx.beginPath();
      ctx.arc(W/2 + Math.cos(t + i)*100, waveY, 150 + i*50, 0, Math.PI*2);
      ctx.fill();
    }

    // Title
    ctx.fillStyle = "white";
    ctx.font = "bold 80px Arial";
    ctx.textAlign = "center";
    const glow = Math.sin(t*2)*20 + 50;
    ctx.shadowColor = "rgba(255,100,100,0.5)";
    ctx.shadowBlur = glow;
    ctx.fillText("🧛 SHADOWBOUND 🧛", W/2, 120);
    ctx.shadowBlur = 0;
    
    // Subtitle
    ctx.font = "28px Arial";
    ctx.fillStyle = "rgba(255,150,150,0.9)";
    ctx.fillText("Stay in the shadows. Survive the light.", W/2, 180);
    
    // Play Button
    const playY = H/2 - 50;
    ctx.fillStyle = "rgba(100,255,100,0.8)";
    ctx.fillRect(W/2 - 150, playY, 300, 80);
    ctx.strokeStyle = "rgba(150,255,150,1)";
    ctx.lineWidth = 4;
    ctx.strokeRect(W/2 - 150, playY, 300, 80);
    ctx.fillStyle = "white";
    ctx.font = "bold 40px Arial";
    ctx.fillText("▶ PLAY", W/2, playY + 55);
    
    // Settings Button
    const settingsY = H/2 + 60;
    ctx.fillStyle = "rgba(100,150,255,0.8)";
    ctx.fillRect(W/2 - 150, settingsY, 300, 80);
    ctx.strokeStyle = "rgba(150,200,255,1)";
    ctx.lineWidth = 4;
    ctx.strokeRect(W/2 - 150, settingsY, 300, 80);
    ctx.fillStyle = "white";
    ctx.font = "bold 40px Arial";
    ctx.fillText("⚙ SETTINGS", W/2, settingsY + 55);
    
    // Info Text
    ctx.font = "16px Arial";
    ctx.fillStyle = "rgba(200,200,200,0.7)";
    ctx.textAlign = "center";
    ctx.fillText("Level 1-5 | Difficulty Scaling | Leaderboard", W/2, H - 50);
    ctx.fillText("Use W/A/S/D to move, SPACE to jump, hide from light!", W/2, H - 20);
    
    ctx.textAlign = "left";
    ctx.restore();
    requestAnimationFrame(draw);
    return;
  }

  if(gameState==="end"){
    // End Screen
    const gradient = ctx.createLinearGradient(0,0,0,H);
    gradient.addColorStop(0,"#1a0a0a");
    gradient.addColorStop(1,"#2a1a1a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0,W,H);

    ctx.fillStyle="white";
    ctx.font="60px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🏆 SPIEL ABGESCHLOSSEN", W/2, H/2-120);
    ctx.font="40px Arial";
    ctx.fillText("Final Score: "+score, W/2, H/2-20);
    ctx.fillText("Best Time: "+bestTime+"s", W/2, H/2+50);
    
    // Achievements anzeigen
    ctx.font="24px Arial";
    ctx.fillText("🏅 Achievements:", W/2, H/2+120);
    let achY = H/2+150;
    Object.keys(unlockedAchievements).forEach(key => {
      if(unlockedAchievements[key]) {
        ctx.font="18px Arial";
        ctx.fillText(achievements[key].name + " - " + achievements[key].desc, W/2, achY);
        achY += 25;
      }
    });
    
    // Leaderboard
    ctx.font="24px Arial";
    ctx.fillText("🎯 Top Scores:", 50, H/2+120);
    leaderboard.slice(0, 5).forEach((entry, i) => {
      ctx.font="16px Arial";
      ctx.textAlign = "left";
      ctx.fillText(`${i+1}. ${entry.score} pts (${entry.time}s)`, 50, H/2+150+i*25);
    });
    
    ctx.textAlign = "center";
    ctx.font="24px Arial";
    ctx.fillStyle="rgba(100,255,100,0.8)";
    ctx.fillText("KLICKE ZUM NEUSTARTEN", W/2, H-50);
    ctx.textAlign = "left";
    ctx.restore();
    requestAnimationFrame(draw);
    return;
  }

  // Hauptspiel-Rendering
  drawSky();   // Himmel + Wolken
  castRays();  // Wände / Licht / Schatten

  // Licht-Maske um die Mitte (stellt Licht um Spieler dar)
  // Wir legen eine halb-Transparente dunkle Ebene darüber und schneiden ein Kreislicht in der Bildschirmmitte aus.
  ctx.save();
  // Full dark overlay
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0,0,W,H);

  // radial gradient for soft edges (destination-out will cut the overlay)
  const rad = player.lightRadius;
  const grad = ctx.createRadialGradient(W/2, H/2, rad * 0.15, W/2, H/2, rad);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(W/2, H/2, rad, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  drawFog();   // Nebel
  drawUI();    // UI + Minimap

  ctx.restore(); // restore after shake translate

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// ---- POKI INTEGRATION (für später) ----
// PokiSDK.gameLoadingFinished()
// PokiSDK.gameLoadingStart()
// PokiSDK.gameplayStart()
// PokiSDK.gameplayStop()
