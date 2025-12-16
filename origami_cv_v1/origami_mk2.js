// ==========================================================================
// [origami_mk2.js] - Performance Optimized Version
// ==========================================================================

// ##########################################################################
// [★ 튜닝 설정 구역]
// ##########################################################################

// [모터 하드웨어 설정]
const MOTOR_STOPS = [93, 93, 93, 93, 93, 93, 93, 93]; 
const MOTOR_POLARITY = [1, 1, 1, 1, 1, -1, 1, 1]; 

// [제어 파라미터]
const MAX_POWER_LIMIT = 87;  
const POS_GAIN        = 350; 
const VIRTUAL_SPEED_FACTOR = 0.06; 

// [성능 최적화 설정]
const SKIP_FRAMES = 5; // CV 및 UI 업데이트를 3프레임마다 1번만 실행 (랙 방지 핵심)

// ##########################################################################
// [전역 변수 선언]
// ##########################################################################

// 1층 (Bottom Stage)
window.wire1_Up = 0.0; window.wire1_Down = 0.0; window.wire1_Left = 0.0; window.wire1_Right = 0.0;
// 2층 (Top Stage)
window.wire2_Up = 0.0; window.wire2_Down = 0.0; window.wire2_Left = 0.0; window.wire2_Right = 0.0;

let currentMotorPositions = [0, 0, 0, 0, 0, 0, 0, 0];

// 구조 설계 변수
let SEG_COUNT_PER_STAGE = 4;
let SEG_HEIGHT   = 50;
let BODY_RADIUS  = 30;

// 변형 파라미터
let MIN_HEIGHT_RATIO = 0.2; 
let BEND_SENSITIVITY = 1.2; 
let MAX_TWIST_DEG = 35;     
let MAX_BEND_LIMIT_DEG = 15.0; 

// 시스템 변수
let robot;
let panX = 0, panY = 0;
let isPanning = false;
let handController;
let lastSendTime = 0;
const SEND_INTERVAL = 40; 

if (!window.handTensions) window.handTensions = [0,0,0,0,0,0,0,0];

// ##########################################################################
// [클래스 정의] TwoStageRobot
// ##########################################################################

class TwoStageRobot {
  constructor(segPerStage, segH, radius) {
    this.segPerStage = segPerStage;
    this.totalSegs = segPerStage * 2;
    this.segH_orig = segH;
    this.radius = radius;
    this.panels = 6; 

    this.joints = Array(this.totalSegs + 1).fill().map(() => createVector(0,0,0));
    this.rotations = Array(this.totalSegs + 1).fill().map(() => ({x:0, z:0}));
    
    this.stage1 = { h:0, bx:0, bz:0, twist:0, comp:0 };
    this.stage2 = { h:0, bx:0, bz:0, twist:0, comp:0 };
  }

  update() {
    this.stage1 = this.computeStageState(window.wire1_Up, window.wire1_Down, window.wire1_Left, window.wire1_Right);
    this.stage2 = this.computeStageState(window.wire2_Up, window.wire2_Down, window.wire2_Left, window.wire2_Right);
    this.computeCenterline();
  }

  computeStageState(wUp, wDown, wLeft, wRight) {
    let hMax = this.segH_orig;
    let hMin = hMax * MIN_HEIGHT_RATIO;
    
    let lUp = map(wUp, 0, 1, hMax, hMin);
    let lDown = map(wDown, 0, 1, hMax, hMin);
    let lLeft = map(wLeft, 0, 1, hMax, hMin);
    let lRight = map(wRight, 0, 1, hMax, hMin);
    
    let avgH = (lUp + lDown + lLeft + lRight) / 4;
    
    let bx = (lDown - lUp) / (this.radius * 2.2) * BEND_SENSITIVITY;
    let bz = (lRight - lLeft) / (this.radius * 2.2) * BEND_SENSITIVITY;
    
    let limit = radians(MAX_BEND_LIMIT_DEG);
    let mag = sqrt(bx*bx + bz*bz);
    if (mag > limit) { 
      let scale = limit / mag;
      bx *= scale; 
      bz *= scale; 
    }
    
    let comp = map(avgH, hMax, hMin, 0, 1);
    comp = constrain(comp, 0, 0.98);
    let twist = radians(MAX_TWIST_DEG) * comp;
    
    return { h: avgH, bx: bx, bz: bz, twist: twist, comp: comp };
  }

  computeCenterline() {
    this.joints[0].set(0,0,0); 
    this.rotations[0] = {x:0, z:0};
    
    let currPos = this.joints[0].copy();
    let accRotX = 0, accRotZ = 0;

    for(let i=0; i<this.segPerStage; i++) {
      this.advanceSegment(i, currPos, accRotX, accRotZ, this.stage1);
      accRotX += this.stage1.bx; 
      accRotZ += this.stage1.bz;
    }
    
    for(let i=this.segPerStage; i<this.totalSegs; i++) {
      this.advanceSegment(i, currPos, accRotX, accRotZ, this.stage2);
      accRotX += this.stage2.bx; 
      accRotZ += this.stage2.bz;
    }
  }

  advanceSegment(idx, currPos, rX, rZ, stage) {
    let halfX = rX + stage.bx/2;
    let halfZ = rZ + stage.bz/2;
    let vec = createVector(0, stage.h, 0);
    
    let x1 = vec.x*cos(halfZ) - vec.y*sin(halfZ);
    let y1 = vec.x*sin(halfZ) + vec.y*cos(halfZ);
    let z1 = vec.z;
    
    let y2 = y1*cos(halfX) - z1*sin(halfX);
    let z2 = y1*sin(halfX) + z1*cos(halfX);
    let x2 = x1;
    
    currPos.add(x2, y2, z2);
    this.joints[idx+1].set(currPos);
    this.rotations[idx+1] = {x: rX + stage.bx, z: rZ + stage.bz};
  }

  render() {
    // Base
    push(); fill(50); noStroke(); cylinder(this.radius*1.15, 5); pop();
    
    // Stages
    this.renderStage(0, this.segPerStage, this.stage1, color(255, 100, 0), color(80, 30, 0));
    this.renderStage(this.segPerStage, this.totalSegs, this.stage2, color(0, 150, 255), color(0, 40, 80));
    
    // Head
    let head = this.joints[this.totalSegs];
    let rot = this.rotations[this.totalSegs];
    push();
    translate(head.x, head.y, head.z);
    rotateZ(rot.z); rotateX(rot.x);
    fill(50); noStroke(); cylinder(this.radius*0.9, 5);
    pop();

    // Wires
    this.drawWires(0, this.segPerStage, 
      [window.wire1_Up, window.wire1_Down, window.wire1_Left, window.wire1_Right], 1.0);

    this.drawWires(0, this.totalSegs, 
      [window.wire2_Up, window.wire2_Down, window.wire2_Left, window.wire2_Right], 0.9);
  }

  renderStage(startIdx, endIdx, stageState, faceColor, edgeColor) {
    let r = lerp(this.radius, this.radius * 0.85, stageState.comp);
    let alpha = map(stageState.comp, 0, 1, 220, 180);
    fill(red(faceColor), green(faceColor), blue(faceColor), alpha);
    stroke(edgeColor); strokeWeight(1.2);
    
    for(let i=startIdx; i<endIdx; i++) {
      let twistBottom = stageState.twist * (i - startIdx);
      let twistTop = stageState.twist * (i - startIdx + 1);
      this.drawKresling(i, r, twistBottom, twistTop);
    }
  }

  drawKresling(idx, r, tBot, tTop) {
    let p1 = this.joints[idx], p2 = this.joints[idx+1];
    let r1 = this.rotations[idx], r2 = this.rotations[idx+1];
    let n = this.panels;
    
    const getV = (c, rot, theta, t) => {
      let lx = r*cos(theta+t), ly=0, lz=r*sin(theta+t);
      let xz = lx*cos(rot.z) - ly*sin(rot.z);
      let yz = lx*sin(rot.z) + ly*cos(rot.z);
      let yf = yz*cos(rot.x) - lz*sin(rot.x);
      let zf = yz*sin(rot.x) + lz*cos(rot.x);
      return createVector(c.x+xz, c.y+yf, c.z+zf);
    };

    beginShape(TRIANGLES);
    for(let i=0; i<n; i++) {
      let ang1 = TWO_PI/n*i, ang2 = TWO_PI/n*((i+1)%n);
      let v1=getV(p1,r1,ang1,tBot), v2=getV(p1,r1,ang2,tBot);
      let v3=getV(p2,r2,ang1,tTop), v4=getV(p2,r2,ang2,tTop);
      vertex(v1.x,v1.y,v1.z); vertex(v2.x,v2.y,v2.z); vertex(v3.x,v3.y,v3.z);
      vertex(v2.x,v2.y,v2.z); vertex(v4.x,v4.y,v4.z); vertex(v3.x,v3.y,v3.z);
    }
    endShape();
  }

  drawWires(startIdx, endIdx, tensions, scale) {
    let base = this.joints[startIdx];
    let head = this.joints[endIdx];
    let hRot = this.rotations[endIdx];
    let wr = this.radius * scale;

    const drawOne = (ang, t) => {
        let bx = wr*cos(ang), bz = wr*sin(ang);
        let start = createVector(base.x+bx, base.y, base.z+bz);
        let hx = wr*cos(ang), hy=0, hz=wr*sin(ang);
        let xz = hx*cos(hRot.z) - hy*sin(hRot.z);
        let yz = hx*sin(hRot.z) + hy*cos(hRot.z);
        let yf = yz*cos(hRot.x) - hz*sin(hRot.x);
        let zf = yz*sin(hRot.x) + hz*cos(hRot.x);
        let end = createVector(head.x+xz, head.y+yf, head.z+zf);
        stroke(lerpColor(color(50,100,255,150), color(255,50,50,200), t));
        strokeWeight(1.5 + t*2.5);
        line(start.x, start.y, start.z, end.x, end.y, end.z);
    };
    drawOne(PI/2, tensions[0]); drawOne(-PI/2, tensions[1]);
    drawOne(PI, tensions[2]); drawOne(0, tensions[3]);
  }
}

// ##########################################################################
// [메인 로직]
// ##########################################################################

function setup() {
  const holder = document.getElementById('sketch-holder');
  let w = holder ? holder.clientWidth : windowWidth;
  let h = holder ? holder.clientHeight : windowHeight;
  if (h < 300) h = window.innerHeight; 

  let cnv = createCanvas(w, h, WEBGL);
  if (holder) cnv.parent('sketch-holder');
  
  setAttributes('antialias', true);
  camera(0, -450, 800, 0, -100, 0, 0, 1, 0);

  robot = new TwoStageRobot(SEG_COUNT_PER_STAGE, SEG_HEIGHT, BODY_RADIUS);
  setupEventHandlers();

  if (typeof HandController !== 'undefined') {
    handController = new HandController();
    handController.init();
  }
}

function draw() {
  background(25);

  // 1. [최적화] 무거운 연산(CV, DOM 제어)은 3프레임에 1번만 실행
  // 녹화 시 CPU 부하를 대폭 줄여줍니다.
  let shouldUpdateHeavy = (frameCount % SKIP_FRAMES === 0);
  let handDetected = false;

  if (shouldUpdateHeavy) {
    if (handController) {
      handController.update();    
      handController.drawDebug(); 
    }
    // 슬라이더 업데이트도 잦은 DOM 접근을 피해 가끔 실행
    updateSliders();
  }

  // 2. 손 데이터 적용 (데이터가 있으면 매 프레임 변수에 할당해도 무방)
  if (handController && handController.hands && handController.hands.length > 0) {
    handDetected = true;
    if (shouldUpdateHeavy) { // 값이 변했을 때만 반영
        window.wire2_Up    = window.handTensions[0];
        window.wire2_Down  = window.handTensions[1];
        window.wire2_Left  = window.handTensions[2];
        window.wire2_Right = window.handTensions[3];
        window.wire1_Up    = window.handTensions[4];
        window.wire1_Down  = window.handTensions[5];
        window.wire1_Left  = window.handTensions[6];
        window.wire1_Right = window.handTensions[7];
    }
  }

  // 3. 키보드 제어 (손이 없을 때) - 반응성을 위해 매 프레임 실행
  if (!handDetected) {
    handleKeyboardInput(); 
  }
  
  // 4. 모터 명령 전송 (Serial) - 이미 타이머 제어 중이므로 유지
  if (typeof serialCtrl !== 'undefined' && serialCtrl.isConnected) {
    if (millis() - lastSendTime > SEND_INTERVAL) {
      sendPositionCommands();
      lastSendTime = millis();
    }
  }

  // 5. 3D 렌더링 (부드러운 화면을 위해 매 프레임 실행)
  setupLights();
  
  if (isPanning && mouseIsPressed) {
      panX += movedX; panY += movedY;
  } else {
    orbitControl(1, 1, 0.5); 
  }
  translate(panX, panY, 0);
  
  push();
  scale(1, -1, 1); 
  drawGrid();

  if (robot) {
    robot.update();
    robot.render();
  }
  pop();

  // [디버그] 현재 FPS 표시 (녹화 시 성능 확인용)
  // WebGL 모드에서는 좌표계가 달라져서 2D 텍스트 출력이 복잡하므로 
  // 필요하다면 HTML 요소로 빼거나 아래처럼 임시로 그림
  /*
  push();
  resetMatrix();
  translate(-width/2 + 10, -height/2 + 20);
  fill(0, 255, 0); noStroke();
  // textFont('Arial'); // p5.js WebGL에서 폰트 로드 필요할 수 있음
  // text("FPS: " + frameRate().toFixed(1), 0, 0); 
  pop();
  */
}

function sendPositionCommands() {
  let targetPositions = [
    window.wire2_Up, window.wire2_Down, window.wire2_Left, window.wire2_Right,
    window.wire1_Up, window.wire1_Down, window.wire1_Left, window.wire1_Right
  ];
  let commands = [];
  for (let i = 0; i < 8; i++) {
    let target = targetPositions[i];
    let current = currentMotorPositions[i];
    let error = target - current;
    
    let motorSpeed = 0;
    if (Math.abs(error) > 0.015) { 
       motorSpeed = error * POS_GAIN;
       motorSpeed = constrain(motorSpeed, -MAX_POWER_LIMIT, MAX_POWER_LIMIT);
    }
    let cmdVal = Math.floor(MOTOR_STOPS[i] + (motorSpeed * MOTOR_POLARITY[i]));
    cmdVal = constrain(cmdVal, 0, 180); 
    commands.push(cmdVal);

    if (motorSpeed !== 0) {
        let speedRatio = motorSpeed / MAX_POWER_LIMIT; 
        currentMotorPositions[i] += speedRatio * VIRTUAL_SPEED_FACTOR;
        currentMotorPositions[i] = constrain(currentMotorPositions[i], 0.0, 1.0);
    }
  }
  serialCtrl.write(commands.join(','));
}

function handleKeyboardInput() {
  const SPEED = 0.02; 
  // Top Stage (2층)
  if (keyIsDown(49)) window.wire2_Up = min(window.wire2_Up + SPEED, 1);     
  if (keyIsDown(81)) window.wire2_Up = max(window.wire2_Up - SPEED, 0);     
  if (keyIsDown(50)) window.wire2_Down = min(window.wire2_Down + SPEED, 1); 
  if (keyIsDown(87)) window.wire2_Down = max(window.wire2_Down - SPEED, 0); 
  if (keyIsDown(51)) window.wire2_Left = min(window.wire2_Left + SPEED, 1); 
  if (keyIsDown(69)) window.wire2_Left = max(window.wire2_Left - SPEED, 0); 
  if (keyIsDown(52)) window.wire2_Right = min(window.wire2_Right + SPEED, 1); 
  if (keyIsDown(82)) window.wire2_Right = max(window.wire2_Right - SPEED, 0); 

  // Bottom Stage (1층)
  if (keyIsDown(65)) window.wire1_Up = min(window.wire1_Up + SPEED, 1);     
  if (keyIsDown(90)) window.wire1_Up = max(window.wire1_Up - SPEED, 0);     
  if (keyIsDown(83)) window.wire1_Down = min(window.wire1_Down + SPEED, 1);   
  if (keyIsDown(88)) window.wire1_Down = max(window.wire1_Down - SPEED, 0);   
  if (keyIsDown(68)) window.wire1_Left = min(window.wire1_Left + SPEED, 1);   
  if (keyIsDown(67)) window.wire1_Left = max(window.wire1_Left - SPEED, 0);   
  if (keyIsDown(70)) window.wire1_Right = min(window.wire1_Right + SPEED, 1); 
  if (keyIsDown(86)) window.wire1_Right = max(window.wire1_Right - SPEED, 0); 
}

function updateSliders() {
    let s2_u = document.getElementById('slider_wire2_Up');
    if(s2_u) {
        document.getElementById('slider_wire2_Up').value = window.wire2_Up;
        document.getElementById('slider_wire2_Down').value = window.wire2_Down;
        document.getElementById('slider_wire2_Left').value = window.wire2_Left;
        document.getElementById('slider_wire2_Right').value = window.wire2_Right;
        document.getElementById('slider_wire1_Up').value = window.wire1_Up;
        document.getElementById('slider_wire1_Down').value = window.wire1_Down;
        document.getElementById('slider_wire1_Left').value = window.wire1_Left;
        document.getElementById('slider_wire1_Right').value = window.wire1_Right;
    }
}

function setupEventHandlers() {
  let panToggle = document.getElementById('panToggle');
  if (panToggle) panToggle.addEventListener('change', () => { isPanning = panToggle.checked; });

  let btnConnect = document.getElementById('btnConnect');
  if (btnConnect) {
    btnConnect.addEventListener('click', () => {
      if (typeof serialCtrl !== 'undefined') serialCtrl.connect();
    });
  }
}

function setupLights() {
  ambientLight(120); 
  directionalLight(255, 255, 250, 0.5, 1, -0.8); 
  pointLight(200, 200, 255, 0, -300, 300); 
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  camera(0, -450, 800, 0, -100, 0, 0, 1, 0);
}

function drawGrid() {
  push();
  stroke(50);
  strokeWeight(1);
  for (let i = -15; i <= 15; i++) {
    line(i * 50, 0, -750, i * 50, 0, 750);
    line(-750, 0, i * 50, 750, 0, i * 50);
  }
  pop();
}