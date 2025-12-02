// ==========================================================================
// [설정 패널] 시뮬레이션의 모든 파라미터는 여기서 설정합니다.
// ==========================================================================

// -----------------------------------------------------------
// 1. [구조 설계] 로봇의 모양과 크기 설정
// -----------------------------------------------------------
let SEG_COUNT    = 8;    // [층수] 로봇이 몇 개의 층으로 이루어져 있는지
let SEG_HEIGHT   = 50;   // [높이] 한 층(Segment)의 높이 (단위: 픽셀)
let BODY_RADIUS  = 30;   // [지름] 로봇 몸통의 반지름 (단위: 픽셀)
let PANELS_COUNT = 6;    // [다각형] Kresling 패턴의 각형 수

// -----------------------------------------------------------
// 2. [와이어 배치] 와이어가 설치된 위치 설정
// -----------------------------------------------------------
let WIRE_BASE_SCALE = 3.5; // 바닥 와이어 거리 (반지름 배수)
let WIRE_HEAD_SCALE = 1.3; // 헤드 와이어 거리 (반지름 배수)

// -----------------------------------------------------------
// 3. [물리적 특성] 종이의 재질과 움직임 특성
// -----------------------------------------------------------
let BEND_SENSITIVITY = 0.8; // 굽힘 민감도
let MAX_TWIST_DEG = 30;     // 압축 시 회전 각도 (도)
let MAX_BEND_LIMIT_DEG = 10.0; // 층당 최대 꺾임 한계 (도)

// -----------------------------------------------------------
// 4. [압축 한계] 로봇이 접혔을 때의 모양 제한
// -----------------------------------------------------------
let MIN_HEIGHT_RATIO = 0.15; // 최소 높이 비율
let MIN_RADIUS_RATIO = 1.2;  // 압축 시 팽창 비율

// ==========================================================================
// [시스템 변수]
// ==========================================================================

let robot;
let ui = {};
let panX = 0, panY = 0;
let isPanning = false;
let simTime = 0;

// [전역 변수] 와이어 장력 (0.0 ~ 1.0)
// cv_control.js의 HandController가 이 변수들을 직접 수정합니다.
var wireUp = 0.0, wireDown = 0.0, wireLeft = 0.0, wireRight = 0.0;  

// [추가됨] 핸드 컨트롤러 인스턴스
let handController; 

// =============================
// OrigamiRobot 클래스
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

    // 2. 중심축 높이 (평균)
    let avgH = (lenUp + lenDown + lenLeft + lenRight) / 4;
    
    // 3. 굽힘 각도 계산
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

// =============================
// Setup & Draw (p5.js)
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

  // [수정됨] 카메라 컨트롤러 초기화 (cv_control.js에 정의된 클래스 사용)
  if (typeof HandController !== 'undefined') {
    handController = new HandController();
    handController.init();
  } else {
    console.warn("cv_control.js가 로드되지 않았습니다. HandController를 찾을 수 없습니다.");
  }
}

function initCamera() {
  camera(0, -350, 500, 0, -50, 0, 0, 1, 0);
}

function setupUI() {
  ui.panToggle = document.getElementById('panToggle');
  if (ui.panToggle) {
    ui.panToggle.addEventListener('change', () => { isPanning = ui.panToggle.checked; });
  }

  ui.wireUp    = document.getElementById('wireUp');
  ui.wireDown  = document.getElementById('wireDown');
  ui.wireLeft  = document.getElementById('wireLeft');
  ui.wireRight = document.getElementById('wireRight');
  
  ui.wireUpVal    = document.getElementById('wireUpVal');
  ui.wireDownVal  = document.getElementById('wireDownVal');
  ui.wireLeftVal  = document.getElementById('wireLeftVal');
  ui.wireRightVal = document.getElementById('wireRightVal');

  ui.infoAngles = document.getElementById('infoAngles');
  ui.infoEE     = document.getElementById('infoEE');

  const bindWire = (slider, labelSpan, setter) => {
    if (!slider) return;
    slider.oninput = () => {
      const v = parseFloat(slider.value);
      setter(v);
      if (labelSpan) labelSpan.textContent = v.toFixed(2);
    };
  };

  bindWire(ui.wireUp,    ui.wireUpVal,    v => wireUp = v);
  bindWire(ui.wireDown,  ui.wireDownVal,  v => wireDown = v);
  bindWire(ui.wireLeft,  ui.wireLeftVal,  v => wireLeft = v);
  bindWire(ui.wireRight, ui.wireRightVal, v => wireRight = v);
  
  // 시리얼 버튼은 이제 필요 없거나, 기존 UI 유지용으로 둠 (작동 안 함)
  const btnSerial = document.getElementById('btnSerial');
  if(btnSerial) btnSerial.style.display = 'none'; // 숨김 처리
}

function windowResized() {
  const holder = document.getElementById('sketch-holder');
  let w = holder ? holder.clientWidth : windowWidth;
  let h = holder ? holder.clientHeight : windowHeight;
  resizeCanvas(w, h);
  initCamera();
}

function draw() {
  background(30);

  // [수정됨] 핸드 컨트롤러 업데이트 및 디버그 뷰 그리기
  let handDetected = false;
  if (handController) {
    handController.update();    // 손 위치에 따라 wire 변수 업데이트
    handController.drawDebug(); // 화면 좌상단에 카메라 영상 오버레이
    
    // 손이 인식되었는지 확인 (Hands 배열 길이 체크)
    if (handController.hands && handController.hands.length > 0) {
      handDetected = true;
      syncSliders(); // UI 슬라이더 움직임 동기화
    }
  }

  ambientLight(100); 
  directionalLight(255, 255, 255, 0.5, 1, -0.5); 
  pointLight(200, 200, 200, 0, 0, 300); 

  if (isPanning && mouseIsPressed) {
      panX += movedX;
      panY += movedY;
  } else {
    orbitControl();
  }
  translate(panX, panY, 0);

  push();
  scale(1, -1, 1);

  drawGrid();

  // [수정됨] 손이 없을 때만 키보드 입력 받기 (우선순위 처리)
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
    ui.infoAngles.innerText =
      `Tensions: U=${wireUp.toFixed(2)} D=${wireDown.toFixed(2)} L=${wireLeft.toFixed(2)} R=${wireRight.toFixed(2)}\n` +
      `Comp: ${(robot.compFactor * 100).toFixed(0)}% | Twist: ${degrees(robot.twistAngle).toFixed(1)}°`;
  }
  if (ui.infoEE && robot) {
    const h = robot.getHeadPosition();
    ui.infoEE.innerText = `Head: (${h.x.toFixed(1)}, ${h.y.toFixed(1)}, ${h.z.toFixed(1)})`;
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
    wireUp    = constrain(wireUp, 0, 1);
    wireDown  = constrain(wireDown, 0, 1);
    wireLeft  = constrain(wireLeft, 0, 1);
    wireRight = constrain(wireRight, 0, 1);
    syncSliders();
  }
}

function syncSliders() {
  if (ui.wireUp) { ui.wireUp.value = wireUp; if(ui.wireUpVal) ui.wireUpVal.textContent = wireUp.toFixed(2); }
  if (ui.wireDown) { ui.wireDown.value = wireDown; if(ui.wireDownVal) ui.wireDownVal.textContent = wireDown.toFixed(2); }
  if (ui.wireLeft) { ui.wireLeft.value = wireLeft; if(ui.wireLeftVal) ui.wireLeftVal.textContent = wireLeft.toFixed(2); }
  if (ui.wireRight) { ui.wireRight.value = wireRight; if(ui.wireRightVal) ui.wireRightVal.textContent = wireRight.toFixed(2); }
} 