// [origami_mk2.js] - Performance Optimized Version
// =========================================================================

// [★ 튜닝 설정]
const SKIP_FRAMES = 5; // ★ 핵심: 5프레임마다 1번만 무거운 연산 실행 (녹화 끊김 방지)

const MOTOR_STOPS = [93, 96, 93, 93, 93, 93, 93, 93]; 
const MOTOR_POLARITY = [-1, 1, -1, 1, -1, -1, -1, 1]; 

// [제어 변경] 고정 속도 설정
const PWM_OFFSET = 45; // 정지값(93)에서 더하거나 뺄 속도 크기
const VISUAL_SPEED = 0.01; // 화면상에서 로봇이 움직이는 속도

// [전역 변수] - 시각화용
window.wire1_Up = 0.0; window.wire1_Down = 0.0; window.wire1_Left = 0.0; window.wire1_Right = 0.0;
window.wire2_Up = 0.0; window.wire2_Down = 0.0; window.wire2_Left = 0.0; window.wire2_Right = 0.0;

// 각 모터의 현재 상태를 저장하는 배열 (-1:풀기, 0:정지, 1:감기)
let motorStates = [0, 0, 0, 0, 0, 0, 0, 0];

let SEG_COUNT_PER_STAGE = 4;
let SEG_HEIGHT   = 50;
let BODY_RADIUS  = 30;

let MIN_HEIGHT_RATIO = 0.2; 
let BEND_SENSITIVITY = 1.2; 
let MAX_TWIST_DEG = 35;     
let MAX_BEND_LIMIT_DEG = 15.0; 

let robot;
let panX = 0, panY = 0;
let isPanning = false;
let handController;
let lastSendTime = 0;
const SEND_INTERVAL = 50; // 통신 주기

if (!window.handTensions) window.handTensions = [0,0,0,0,0,0,0,0];
if (!window.handThumbState) window.handThumbState = [false, false];


// ##########################################################################
// [Class] TwoStageRobot
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
    if (mag > limit) { let scale = limit / mag; bx *= scale; bz *= scale; }
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
      accRotX += this.stage1.bx; accRotZ += this.stage1.bz;
    }
    for(let i=this.segPerStage; i<this.totalSegs; i++) {
      this.advanceSegment(i, currPos, accRotX, accRotZ, this.stage2);
      accRotX += this.stage2.bx; accRotZ += this.stage2.bz;
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
    push(); fill(50); noStroke(); cylinder(this.radius*1.15, 5); pop();
    this.renderStage(0, this.segPerStage, this.stage1, color(255, 100, 0), color(80, 30, 0));
    this.renderStage(this.segPerStage, this.totalSegs, this.stage2, color(0, 150, 255), color(0, 40, 80));
    let head = this.joints[this.totalSegs];
    let rot = this.rotations[this.totalSegs];
    push();
    translate(head.x, head.y, head.z);
    rotateZ(rot.z); rotateX(rot.x);
    fill(50); noStroke(); cylinder(this.radius*0.9, 5);
    pop();
    this.drawWires(0, this.segPerStage, [window.wire1_Up, window.wire1_Down, window.wire1_Left, window.wire1_Right], 1.0);
    this.drawWires(0, this.totalSegs, [window.wire2_Up, window.wire2_Down, window.wire2_Left, window.wire2_Right], 0.9);
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
// [Main Loop]
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

  // [최적화] 5프레임마다 1번만 무거운 연산(CV, DOM) 실행
  let shouldRunHeavyTask = (frameCount % SKIP_FRAMES === 0);

  // 1. 입력 감지 및 모터 상태(motorStates) 업데이트
  motorStates.fill(0); // 매 프레임 초기화

  let handDetected = false;
  if (handController) {
    // 무거운 CV 업데이트는 가끔 실행
    if (shouldRunHeavyTask) {
        handController.update();    
        handController.drawDebug(); 
    }
    
    // 데이터가 존재하면(직전 프레임 데이터라도) 손 제어 적용
    if (handController.hands && handController.hands.length > 0) {
      handDetected = true;
      applyHandControl(); 
    }
  }

  // 손이 없을 때 키보드 제어 (가벼우므로 매 프레임 체크하여 반응성 유지)
  if (!handDetected) {
    handleKeyboardInput(); 
  }
  
  // 2. 모터 제어 명령 전송 & 3. 화면 시각화 업데이트 (매 프레임 실행)
  // 통신은 내부 타이머로 조절되지만, 시뮬레이션 움직임(processMotorLogic)은 부드러워야 하므로 매번 실행
  processMotorLogic(); 

  // UI 슬라이더 업데이트 (DOM 조작은 무거우므로 제한)
  if (shouldRunHeavyTask) {
    updateSliders();
  }
  
  // 4. 3D 렌더링 (매 프레임 실행 필수)
  setupLights();
  if (isPanning && mouseIsPressed) { panX += movedX; panY += movedY; }
  else { orbitControl(1, 1, 0.5); }
  translate(panX, panY, 0);
  push(); scale(1, -1, 1); drawGrid();
  if (robot) { robot.update(); robot.render(); }
  pop();
}

// =================================================================
// [Logic] 손 동작 -> 모터 상태 결정 (단순 ON/OFF)
// =================================================================
function applyHandControl() {
  const THRESHOLD = 0.6; // 접힘 임계값

  // [왼손] Top Stage (모터 0~3)
  let dirL = window.handThumbState[0] ? -1 : 1; 
  if (window.handTensions[0] > THRESHOLD) motorStates[0] = dirL; 
  if (window.handTensions[1] > THRESHOLD) motorStates[1] = dirL; 
  if (window.handTensions[2] > THRESHOLD) motorStates[2] = dirL; 
  if (window.handTensions[3] > THRESHOLD) motorStates[3] = dirL; 

  // [오른손] Bottom Stage (모터 4~7)
  let dirR = window.handThumbState[1] ? -1 : 1;
  if (window.handTensions[4] > THRESHOLD) motorStates[4] = dirR;
  if (window.handTensions[5] > THRESHOLD) motorStates[5] = dirR;
  if (window.handTensions[6] > THRESHOLD) motorStates[6] = dirR;
  if (window.handTensions[7] > THRESHOLD) motorStates[7] = dirR;
}

// =================================================================
// [Logic] 키보드 -> 모터 상태 결정
// =================================================================
function handleKeyboardInput() {
  // Top (0~3)
  if (keyIsDown(49)) motorStates[0] = 1;  // '1'
  if (keyIsDown(81)) motorStates[0] = -1; // 'q'
  if (keyIsDown(50)) motorStates[1] = 1;
  if (keyIsDown(87)) motorStates[1] = -1;
  if (keyIsDown(51)) motorStates[2] = 1;
  if (keyIsDown(69)) motorStates[2] = -1;
  if (keyIsDown(52)) motorStates[3] = 1;
  if (keyIsDown(82)) motorStates[3] = -1;

  // Bottom (4~7)
  if (keyIsDown(65)) motorStates[4] = 1;  // 'a'
  if (keyIsDown(90)) motorStates[4] = -1; // 'z'
  if (keyIsDown(83)) motorStates[5] = 1;
  if (keyIsDown(88)) motorStates[5] = -1;
  if (keyIsDown(68)) motorStates[6] = 1;
  if (keyIsDown(67)) motorStates[6] = -1;
  if (keyIsDown(70)) motorStates[7] = 1;
  if (keyIsDown(86)) motorStates[7] = -1;
}

// =================================================================
// [Logic] 모터 명령 생성 및 시뮬레이션 화면 업데이트
// =================================================================
function processMotorLogic() {
  // A. 시리얼 통신 (ESP32로 속도 명령 전송)
  if (typeof serialCtrl !== 'undefined' && serialCtrl.isConnected) {
    if (millis() - lastSendTime > SEND_INTERVAL) {
      let commands = [];
      for(let i=0; i<8; i++) {
        let dir = motorStates[i];
        let pwm = Math.floor(MOTOR_STOPS[i] + (dir * PWM_OFFSET * MOTOR_POLARITY[i]));
        pwm = constrain(pwm, 0, 180);
        commands.push(pwm);
      }
      serialCtrl.write(commands.join(','));
      lastSendTime = millis();
    }
  }

  // B. 시뮬레이션 시각화 (화면 속 로봇 움직이기)
  let wireVars = [
    'wire2_Up', 'wire2_Down', 'wire2_Left', 'wire2_Right', // 0~3
    'wire1_Up', 'wire1_Down', 'wire1_Left', 'wire1_Right'  // 4~7
  ];

  for(let i=0; i<8; i++) {
    let dir = motorStates[i];
    if (dir !== 0) {
      window[wireVars[i]] += dir * VISUAL_SPEED;
      window[wireVars[i]] = constrain(window[wireVars[i]], 0.0, 1.0);
    }
  }
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
  push(); stroke(50); strokeWeight(1);
  for (let i = -15; i <= 15; i++) {
    line(i * 50, 0, -750, i * 50, 0, 750);
    line(-750, 0, i * 50, 750, 0, i * 50);
  }
  pop();
}