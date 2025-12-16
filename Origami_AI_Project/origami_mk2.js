// ==========================================================================
// [origami_mk2.js] - Pro Renderer (Y-Up System, Clean Head Viz) + Keyboard Input
// ==========================================================================

// ##########################################################################
// [전역 변수 선언]
// ##########################################################################
window.wire1_Up = 0.0; window.wire1_Down = 0.0; window.wire1_Left = 0.0; window.wire1_Right = 0.0;
window.wire2_Up = 0.0; window.wire2_Down = 0.0; window.wire2_Left = 0.0; window.wire2_Right = 0.0;

// 시각화용 타겟 위치
window.targetPos = null;

let SEG_COUNT_PER_STAGE = 4;
let SEG_HEIGHT   = 50;
let BODY_RADIUS  = 30;

let MIN_HEIGHT_RATIO = 0.2; 
let BEND_SENSITIVITY = 1.2; 
let MAX_TWIST_DEG = 35;     
let MAX_BEND_LIMIT_DEG = 15.0; 

window.robot = null; 

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
      accRotX += this.stage1.bx; accRotZ += this.stage1.bz;
    }
    for(let i=this.segPerStage; i<this.totalSegs; i++) {
      this.advanceSegment(i, currPos, accRotX, accRotZ, this.stage2);
      accRotX += this.stage2.bx; accRotZ += this.stage2.bz;
    }
  }

  advanceSegment(idx, currPos, rX, rZ, stage) {
    // Y축 방향으로 성장
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
    // 1. Base (바닥)
    push(); fill(50); noStroke(); cylinder(this.radius*1.15, 5); pop();
    
    // 2. Stages (몸통)
    this.renderStage(0, this.segPerStage, this.stage1, color(255, 100, 0), color(80, 30, 0));
    this.renderStage(this.segPerStage, this.totalSegs, this.stage2, color(0, 150, 255), color(0, 40, 80));
    
    // 3. Head (머리) 
    let head = this.joints[this.totalSegs];
    let rot = this.rotations[this.totalSegs];

    push();
    translate(head.x, head.y, head.z);

    // 회색 캡 (베이스)
    push();
    rotateZ(rot.z); rotateX(rot.x);
    fill(50); noStroke(); 
    cylinder(this.radius*0.9, 5);
    pop();

    // (A) 노란색 구 (Head Point) - 좌표축 제거됨
    noStroke();
    emissiveMaterial(255, 255, 0); // 자체 발광
    fill(255, 215, 0);             // Gold 색상
    sphere(8);                     // 반지름 8

    pop();
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
  
  // 카메라: 위쪽에서 내려다봄
  camera(0, -500, 800, 0, -100, 0, 0, 1, 0);

  window.robot = new TwoStageRobot(SEG_COUNT_PER_STAGE, SEG_HEIGHT, BODY_RADIUS);
}

function draw() {
  background(25);
  orbitControl(2, 2, 1.0); 

  if (typeof window.aiManager !== 'undefined') {
    window.aiManager.update();
  }

  setupLights();
  
  // Y-Up 좌표계 적용
  push();
  scale(1, -1, 1); 
  
  drawGrid();

  if (window.robot) {
    window.robot.update();
    window.robot.render();
  }

  // AI 제어 타겟 시각화 (빨간 공)
  if (window.targetPos) {
      push();
      translate(window.targetPos.x, window.targetPos.y, window.targetPos.z);
      fill(255, 0, 0, 150);
      noStroke();
      sphere(8);
      pop();
      // 바닥 기준선
      push();
      stroke(255, 100);
      line(window.targetPos.x, window.targetPos.y, 0, window.targetPos.x, 0, window.targetPos.z);
      pop();
  }

  pop();
}

function setupLights() {
  ambientLight(120); 
  directionalLight(255, 255, 250, 0.5, 1, -0.8); 
  pointLight(200, 200, 255, 0, -300, 300); 
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function drawGrid() {
  push();
  stroke(60);
  strokeWeight(1);
  // XZ 평면 그리드
  for (let i = -15; i <= 15; i++) {
    line(i * 50, 0, -750, i * 50, 0, 750);
    line(-750, 0, i * 50, 750, 0, i * 50);
  }

  // 바닥 기즈모 (World Axis)
  strokeWeight(4);
  // X축: 빨강 (좌우)
  stroke(255, 50, 50); line(0, 0, 0, 200, 0, 0); 
  // Y축: 초록 (높이) - Height
  stroke(50, 255, 50); line(0, 0, 0, 0, 200, 0); 
  // Z축: 파랑 (깊이) - Depth
  stroke(50, 50, 255); line(0, 0, 0, 0, 0, 200); 

  noStroke();
  fill(255, 50, 50); push(); translate(200, 0, 0); sphere(3); pop();
  fill(50, 255, 50); push(); translate(0, 200, 0); sphere(3); pop();
  fill(50, 50, 255); push(); translate(0, 0, 200); sphere(3); pop();

  pop();
}

// ----------------------------------------------------------------
// [추가] 키보드 입력 처리 함수 (P5.js 내장 함수)
// ----------------------------------------------------------------
function keyPressed() {
    if (typeof window.aiManager === 'undefined') return;

    // key는 P5.js에서 눌린 키 문자를 반환합니다.
    switch(key) {
        case 'q': // X축 - 방향 (-)
            window.aiManager.adjustTargetPos('X', -1);
            break;
        case 'a': // X축 + 방향 (+)
            window.aiManager.adjustTargetPos('X', 1);
            break;
        case 'w': // Y축 - 방향 (-)
            window.aiManager.adjustTargetPos('Y', -1);
            break;
        case 's': // Y축 + 방향 (+)
            window.aiManager.adjustTargetPos('Y', 1);
            break;
        case 'e': // Z축 - 방향 (-)
            window.aiManager.adjustTargetPos('Z', -1);
            break;
        case 'd': // Z축 + 방향 (+)
            window.aiManager.adjustTargetPos('Z', 1);
            break;
        default:
            break;
    }
}