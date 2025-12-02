// ==========================================================================
// [origami_mk2.js] - 메인 시뮬레이션 및 비례 속도 제어(P-Control) 로직
// ==========================================================================

// ##########################################################################
// [★ 튜닝 설정 구역] 유지보수 시 이 부분의 숫자만 변경하세요!
// ##########################################################################

// 1. [모터 기본 설정]
// --------------------------------------------------------------------------
const SERVO_STOP   = 93;  // [중요] 모터가 멈추는 정지값 (본인 모터에 맞춰 90~94 수정)

// 2. [비례 제어 민감도 설정] (손 속도 -> 모터 파워 변환)
// --------------------------------------------------------------------------
const SPEED_GAIN      = 800; // [민감도] 클수록 손을 조금만 빨리 움직여도 모터가 쌩~ 돕니다.
const MIN_POWER       = 10;  // [최소 파워] 모터가 웅~ 소리만 나고 안 도는 것을 방지 (정지값 ±10부터 시작)
const MAX_POWER_LIMIT = 87;  // [최대 파워] 모터 안전장치 (180도/0도를 넘지 않도록 제한)

// 3. [반응 임계값]
// --------------------------------------------------------------------------
const DELTA_THRESHOLD = 0.005; // 손 떨림 무시 범위 (이 값보다 변위가 작으면 무시)

// 4. [통신 주기]
// --------------------------------------------------------------------------
const SEND_INTERVAL = 50;      // 50ms (초당 20회 전송) - 너무 빠르면 통신 에러

// ##########################################################################


// -----------------------------------------------------------
// [구조 설계 변수]
// -----------------------------------------------------------
let SEG_COUNT    = 8;    // 층수
let SEG_HEIGHT   = 50;   // 층 높이
let BODY_RADIUS  = 30;   // 반지름
let PANELS_COUNT = 6;    // 각형
let WIRE_BASE_SCALE = 3.5;
let WIRE_HEAD_SCALE = 1.3;

// -----------------------------------------------------------
// [물리적 특성]
// -----------------------------------------------------------
let BEND_SENSITIVITY = 0.8;
let MAX_TWIST_DEG = 30;
let MAX_BEND_LIMIT_DEG = 10.0;
let MIN_HEIGHT_RATIO = 0.15;
let MIN_RADIUS_RATIO = 1.2;

// -----------------------------------------------------------
// [시스템 변수]
// -----------------------------------------------------------
let robot;
let ui = {};
let panX = 0, panY = 0;
let isPanning = false;
let simTime = 0;

// [현재 장력 변수]
var wireUp = 0.0, wireDown = 0.0, wireLeft = 0.0, wireRight = 0.0;

// [이전 프레임 장력 변수] (변위/속도 계산용)
let prevUp = 0.0, prevDown = 0.0, prevLeft = 0.0, prevRight = 0.0;

let handController;
let lastSendTime = 0;

// =============================
// 메인 p5.js 함수들 (Setup & Draw)
// =============================

function setup() {
  const holder = document.getElementById('sketch-holder');
  let w = holder ? holder.clientWidth : windowWidth;
  let h = holder ? holder.clientHeight : windowHeight;
  if (h < 100) h = window.innerHeight; 

  let cnv = createCanvas(w, h, WEBGL);
  if (holder) cnv.parent('sketch-holder');
  
  setAttributes('antialias', true);
  initCamera();

  robot = new OrigamiRobot(SEG_COUNT, SEG_HEIGHT, BODY_RADIUS);
  setupUI();

  // 핸드 컨트롤러 초기화 (cv_control.js가 로드되어 있어야 함)
  if (typeof HandController !== 'undefined') {
    handController = new HandController();
    handController.init();
  } else {
    console.warn("cv_control.js가 로드되지 않았습니다.");
  }
}

function initCamera() {
  camera(0, -350, 500, 0, -50, 0, 0, 1, 0);
}

function draw() {
  background(30);

  // 1. 핸드 트래킹 업데이트
  let handDetected = false;
  if (handController) {
    handController.update();    
    handController.drawDebug(); 
    
    if (handController.hands && handController.hands.length > 0) {
      handDetected = true;
      syncSliders();
    }
  }

  // 2. [핵심] 비례 속도 제어 명령 전송 (ESP32 통신)
  if (typeof serialCtrl !== 'undefined' && serialCtrl.isConnected) {
    if (millis() - lastSendTime > SEND_INTERVAL) {
      sendProportionalCommands();
      lastSendTime = millis();
    }
  }

  // 3. 3D 렌더링 환경 설정
  ambientLight(100); 
  directionalLight(255, 255, 255, 0.5, 1, -0.5); 
  pointLight(200, 200, 200, 0, 0, 300); 

  if (isPanning && mouseIsPressed) {
      panX += movedX; panY += movedY;
  } else {
    orbitControl();
  }
  translate(panX, panY, 0);
  
  push();
  scale(1, -1, 1); // p5.js의 Y축 반전 보정

  drawGrid();

  // 손이 없을 때만 키보드 입력 허용
  if (!handDetected) {
    handleKeyboardInput();
  }

  const dt = deltaTime / 1000.0;
  simTime += dt;

  if (robot) {
    robot.update(dt, simTime);
    robot.render();
  }
  pop();

  updateInfo();
}

// =============================
// [핵심 기능] 비례 제어(P-Control) 계산 및 전송
// =============================
function sendProportionalCommands() {
  
  // 개별 와이어에 대한 비례 속도 계산 함수
  const calcProportionalSpeed = (current, previous) => {
    // 1. 변위(속도) 계산
    let diff = current - previous;
    let absDiff = Math.abs(diff);

    // 2. 데드존 체크 (변화가 너무 작으면 정지)
    if (absDiff < DELTA_THRESHOLD) {
      return SERVO_STOP;
    }

    // 3. 속도 -> 모터 파워 변환 (Gain 곱하기)
    // 예: 변위 0.05 * 800 = 40 (정지값에서 40만큼 더하거나 뺌)
    let power = absDiff * SPEED_GAIN;

    // 4. 파워 제한 (최소 구동력 보장 및 최대 속도 제한)
    power = constrain(power, MIN_POWER, MAX_POWER_LIMIT);
    power = Math.floor(power); // 정수로 변환

    // 5. 방향 결정
    if (diff > 0) {
      // 감기 (Winding): 정지값 + 파워 (예: 93 + 40 = 133)
      return SERVO_STOP + power;
    } else {
      // 풀기 (Unwinding): 정지값 - 파워 (예: 93 - 40 = 53)
      return SERVO_STOP - power;
    }
  };

  let cmdUp    = calcProportionalSpeed(wireUp, prevUp);
  let cmdDown  = calcProportionalSpeed(wireDown, prevDown);
  let cmdLeft  = calcProportionalSpeed(wireLeft, prevLeft);
  let cmdRight = calcProportionalSpeed(wireRight, prevRight);

  // 현재 값을 과거 값으로 저장 (다음 프레임 비교용)
  prevUp = wireUp; 
  prevDown = wireDown; 
  prevLeft = wireLeft; 
  prevRight = wireRight;

  // 시리얼 전송 (포맷: "133,53,93,93")
  let dataStr = `${cmdUp},${cmdDown},${cmdLeft},${cmdRight}`;
  serialCtrl.write(dataStr);
}

// =============================
// UI 및 이벤트 핸들러
// =============================

function setupUI() {
  ui.panToggle = document.getElementById('panToggle');
  if (ui.panToggle) {
    ui.panToggle.addEventListener('change', () => { isPanning = ui.panToggle.checked; });
  }

  // 슬라이더 바인딩
  const bindWire = (id, valId, setter) => {
    let s = document.getElementById(id), l = document.getElementById(valId);
    if (!s) return;
    s.oninput = () => { const v = parseFloat(s.value); setter(v); if (l) l.textContent = v.toFixed(2); };
    ui[id] = s; ui[valId] = l;
  };
  bindWire('wireUp', 'wireUpVal', v => wireUp = v);
  bindWire('wireDown', 'wireDownVal', v => wireDown = v);
  bindWire('wireLeft', 'wireLeftVal', v => wireLeft = v);
  bindWire('wireRight', 'wireRightVal', v => wireRight = v);

  ui.infoAngles = document.getElementById('infoAngles');
  ui.infoEE     = document.getElementById('infoEE');

  // 연결 버튼 이벤트
  const btnConnect = document.getElementById('btnConnect');
  if (btnConnect) {
    btnConnect.addEventListener('click', () => {
      if (typeof serialCtrl !== 'undefined') serialCtrl.connect();
      else alert("serial.js가 로드되지 않았습니다.");
    });
  }
}

function windowResized() {
  const holder = document.getElementById('sketch-holder');
  let w = holder ? holder.clientWidth : windowWidth;
  let h = holder ? holder.clientHeight : windowHeight;
  resizeCanvas(w, h);
  initCamera();
}

function drawGrid() {
  push();
  stroke(60);
  strokeWeight(1);
  for (let i = -10; i <= 10; i++) {
    line(i * 50, 0, -500, i * 50, 0, 500);
    line(-500, 0, i * 50, 500, 0, i * 50);
  }
  pop();
}

function updateInfo() {
  if (ui.infoAngles && robot) {
    ui.infoAngles.innerText = `Comp: ${(robot.compFactor * 100).toFixed(0)}%`;
  }
  if (ui.infoEE && robot) {
    const h = robot.getHeadPosition();
    ui.infoEE.innerText = `Head Y: ${h.y.toFixed(1)}`;
  }
}

function handleKeyboardInput() {
  const SPEED = 0.015; 
  let changed = false;
  if (keyIsDown(81)) { wireUp += SPEED; changed = true; } // Q
  if (keyIsDown(65)) { wireUp -= SPEED; changed = true; } // A
  if (keyIsDown(87)) { wireDown += SPEED; changed = true; } // W
  if (keyIsDown(83)) { wireDown -= SPEED; changed = true; } // S
  if (keyIsDown(69)) { wireLeft += SPEED; changed = true; } // E
  if (keyIsDown(68)) { wireLeft -= SPEED; changed = true; } // D
  if (keyIsDown(82)) { wireRight += SPEED; changed = true; } // R
  if (keyIsDown(70)) { wireRight -= SPEED; changed = true; } // F

  if (changed) {
    wireUp=constrain(wireUp,0,1); wireDown=constrain(wireDown,0,1);
    wireLeft=constrain(wireLeft,0,1); wireRight=constrain(wireRight,0,1);
    syncSliders();
  }
}

function syncSliders() {
  const sync = (s, l, v) => { if (s) { s.value = v; if(l) l.textContent = v.toFixed(2); } };
  sync(ui.wireUp, ui.wireUpVal, wireUp);
  sync(ui.wireDown, ui.wireDownVal, wireDown);
  sync(ui.wireLeft, ui.wireLeftVal, wireLeft);
  sync(ui.wireRight, ui.wireRightVal, wireRight);
}

// =============================
// OrigamiRobot 클래스 (렌더링 포함)
// =============================

class OrigamiRobot {
  constructor(segCount, segHeight, radius) {
    this.segCount  = segCount;
    this.segHeight = segHeight;
    this.radius    = radius;

    this.joints = [];
    this.rotations = []; 

    for (let i = 0; i <= segCount; i++) {
      this.joints.push(createVector(0, 0, 0));
      this.rotations.push({x: 0, z: 0}); 
    }

    this.basePos = createVector(0, 0, 0);
    this.panelsAround = PANELS_COUNT; 
    
    this.segH_current = segHeight; 
    this.bendAngleX = 0;           
    this.bendAngleZ = 0;           
    this.compFactor = 0;           
    this.twistAngle = 0;           
  }

  update(dt, t) {
    // 1. 와이어 길이에 따른 압축 계산
    let hMax = this.segHeight;
    let hMin = this.segHeight * MIN_HEIGHT_RATIO;

    let lenUp    = map(wireUp,    0, 1, hMax, hMin);
    let lenDown  = map(wireDown,  0, 1, hMax, hMin);
    let lenLeft  = map(wireLeft,  0, 1, hMax, hMin);
    let lenRight = map(wireRight, 0, 1, hMax, hMin);

    let avgH = (lenUp + lenDown + lenLeft + lenRight) / 4;
    
    // 2. 굽힘 각도 계산
    let bendMultiplier = BEND_SENSITIVITY; 
    let targetAngleX = (lenDown - lenUp)   / (this.radius * 2) * bendMultiplier; 
    let targetAngleZ = (lenRight - lenLeft) / (this.radius * 2) * bendMultiplier;

    // [물리적 한계 적용]
    let limitRad = radians(MAX_BEND_LIMIT_DEG);
    let magnitude = sqrt(targetAngleX*targetAngleX + targetAngleZ*targetAngleZ);
    
    if (magnitude > limitRad) {
      let scale = limitRad / magnitude;
      targetAngleX *= scale;
      targetAngleZ *= scale;
    }

    this.segH_current = avgH; 
    this.bendAngleX = targetAngleX;
    this.bendAngleZ = targetAngleZ;

    // 압축률 및 비틀림 업데이트
    this.compFactor = map(avgH, hMax, hMin, 0, 1);
    this.compFactor = constrain(this.compFactor, 0, 0.99);
    this.twistAngle = radians(MAX_TWIST_DEG) * this.compFactor;

    this._computeCenterline();
  }

  _computeCenterline() {
    this.joints[0].set(this.basePos.x, this.basePos.y, this.basePos.z);
    this.rotations[0] = { x: 0, z: 0 }; 

    let currentPos = this.joints[0].copy();
    let accRotX = 0;
    let accRotZ = 0;

    for (let i = 0; i < this.segCount; i++) {
      let halfRotX = accRotX + this.bendAngleX / 2;
      let halfRotZ = accRotZ + this.bendAngleZ / 2;

      let vec = createVector(0, this.segH_current, 0);

      // Z축 회전 -> X축 회전 순서
      let x1 = vec.x * cos(halfRotZ) - vec.y * sin(halfRotZ);
      let y1 = vec.x * sin(halfRotZ) + vec.y * cos(halfRotZ);
      let z1 = vec.z;
      
      let y2 = y1 * cos(halfRotX) - z1 * sin(halfRotX);
      let z2 = y1 * sin(halfRotX) + z1 * cos(halfRotX);
      let x2 = x1;

      currentPos.add(x2, y2, z2);
      if (currentPos.y < 0) currentPos.y = 0;

      this.joints[i+1].set(currentPos.x, currentPos.y, currentPos.z);

      accRotX += this.bendAngleX;
      accRotZ += this.bendAngleZ;
      this.rotations[i+1] = { x: accRotX, z: accRotZ };
    }
  }

  _drawKreslingSegment(index) {
    const p1 = this.joints[index];     
    const p2 = this.joints[index + 1]; 
    const r1 = this.rotations[index];     
    const r2 = this.rotations[index + 1]; 

    const n = this.panelsAround;
    const r = lerp(this.radius, this.radius * MIN_RADIUS_RATIO, this.compFactor);
    
    let twistBottom = this.twistAngle * index;
    let twistTop    = this.twistAngle * (index + 1);

    let strokeAlpha = map(this.compFactor, 0, 1, 50, 200);
    stroke(80, 30, 0, strokeAlpha);
    strokeWeight(1.5);
    fill(255, 140, 0, 230); 

    const calcVertex = (center, rot, theta, twist) => {
      let lx = r * cos(theta + twist);
      let ly = 0; 
      let lz = r * sin(theta + twist);

      let x_z = lx * cos(rot.z) - ly * sin(rot.z);
      let y_z = lx * sin(rot.z) + ly * cos(rot.z);
      let z_z = lz;

      let y_final = y_z * cos(rot.x) - z_z * sin(rot.x);
      let z_final = y_z * sin(rot.x) + z_z * cos(rot.x);
      let x_final = x_z;

      let finalPos = createVector(center.x + x_final, center.y + y_final, center.z + z_final);
      if (finalPos.y < 0) finalPos.y = 0;

      return finalPos;
    };

    beginShape(TRIANGLES);
    for (let i = 0; i < n; i++) {
      let t1 = (TWO_PI / n) * i;
      let t2 = (TWO_PI / n) * ((i + 1) % n);

      let v1 = calcVertex(p1, r1, t1, twistBottom);
      let v2 = calcVertex(p1, r1, t2, twistBottom);
      let v3 = calcVertex(p2, r2, t1, twistTop);
      let v4 = calcVertex(p2, r2, t2, twistTop);

      vertex(v1.x, v1.y, v1.z);
      vertex(v2.x, v2.y, v2.z);
      vertex(v3.x, v3.y, v3.z);

      vertex(v2.x, v2.y, v2.z);
      vertex(v4.x, v4.y, v4.z);
      vertex(v3.x, v3.y, v3.z);
    }
    endShape();
  }
  
  _drawWires() {
     const head = this.joints[this.segCount];
     const baseWireRadius = this.radius * WIRE_BASE_SCALE; 
     const headWireRadius = this.radius * WIRE_HEAD_SCALE; 
 
     const drawLine = (angle, tension) => {
       let bx = baseWireRadius * cos(angle);
       let bz = baseWireRadius * sin(angle);
       let start = createVector(bx, 0, bz); 
       
       let rot = this.rotations[this.segCount];
       let hx = headWireRadius * cos(angle);
       let hy = 0; 
       let hz = headWireRadius * sin(angle);
       
       let x_z = hx * cos(rot.z) - hy * sin(rot.z);
       let y_z = hx * sin(rot.z) + hy * cos(rot.z);
       let z_z = hz;
       
       let y_f = y_z * cos(rot.x) - z_z * sin(rot.x);
       let z_f = y_z * sin(rot.x) + z_z * cos(rot.x);
       let x_f = x_z;
       
       let end = createVector(head.x + x_f, head.y + y_f, head.z + z_f);
       if (end.y < 0) end.y = 0;
 
       let col = lerpColor(color(0, 100, 255), color(255, 50, 50), tension);
       push();
       stroke(col);
       strokeWeight(2 + tension * 2);
       line(start.x, start.y, start.z, end.x, end.y, end.z);
       pop();
     };
 
     drawLine(PI/2, wireUp);    // Up
     drawLine(-PI/2, wireDown); // Down
     drawLine(PI, wireLeft);    // Left
     drawLine(0, wireRight);    // Right
  }

  render() {
    const base = this.joints[0];
    
    // 베이스 플레이트
    push();
    translate(0, 0, 0); 
    fill(40);
    noStroke();
    cylinder(this.radius * 1.1, 4);
    pop();

    // 오리가미 바디
    for (let i = 0; i < this.segCount; i++) {
      this._drawKreslingSegment(i);
    }

    // 헤드 플레이트
    const head = this.joints[this.segCount];
    const rot = this.rotations[this.segCount]; 

    push();
    let safeHeadY = Math.max(0, head.y);
    translate(head.x, safeHeadY, head.z);
    rotateZ(rot.z);
    rotateX(rot.x);
    fill(40);
    noStroke();
    cylinder(this.radius * 0.9, 4);
    
    // 헤드 중심점
    push();
    translate(0, 5, 0);
    fill(0, 255, 0);
    sphere(4);
    pop();
    pop();

    // 와이어 그리기
    this._drawWires();
  }
  
  getHeadPosition() {
    const h = this.joints[this.segCount];
    return { x: h.x, y: h.y, z: h.z };
  }
}