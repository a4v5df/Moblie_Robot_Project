// ==========================================
// [cv_control.js] - Fixed ReferenceError
// ==========================================

class HandController {
  constructor() {
    this.video = null;
    this.handPose = null;
    this.hands = [];
    this.isReady = false;
  }

  init() {
    // 1. 웹캠 캡처
    this.video = createCapture(VIDEO);
    this.video.size(320, 240);
    this.video.hide(); 

    // 2. HandPose 모델 로드
    let options = {
      flipped: true,
      maxHands: 1
    };

    this.handPose = ml5.handPose(options, () => {
      console.log('👉 HandPose Model Loaded!');
      this.isReady = true;
      this.handPose.detectStart(this.video, (results) => {
        this.hands = results;
      });
    });
  }

  update() {
    if (!this.isReady || this.hands.length === 0) return;

    let hand = this.hands[0];
    if (!hand.keypoints) return;

    // --- 손가락 굽힘 계산 ---
    let wrist = hand.keypoints[0];
    let middleMCP = hand.keypoints[9];
    let palmSize = dist(wrist.x, wrist.y, middleMCP.x, middleMCP.y);
    
    if (palmSize < 10) return; 

    const calculateTension = (tipIdx) => {
      let tip = hand.keypoints[tipIdx];
      let d = dist(wrist.x, wrist.y, tip.x, tip.y);
      let ratio = d / palmSize; 
      // 1.8(폇을때) ~ 0.7(쥐었을때) -> 0.0 ~ 1.0 매핑
      return map(ratio, 1.8, 0.7, 0.0, 1.0, true);
    };

    // 전역 변수 업데이트
    window.wireUp    = calculateTension(8);  // 검지
    window.wireDown  = calculateTension(12); // 중지
    window.wireLeft  = calculateTension(16); // 약지
    window.wireRight = calculateTension(20); // 소지
  }

  // [수정됨] HTML UI 슬라이더 값을 읽어서 웹캠 화면 크기와 위치를 결정합니다.
  drawDebug() {
    push();
    
    // 1. 3D 공간 설정 초기화
    resetMatrix(); 
    noLights(); 

    // ---------------------------------------------------------
    // [UI 연동] HTML 슬라이더 값을 실시간으로 읽어옵니다.
    // ---------------------------------------------------------
    let sliderSize = document.getElementById('camSize');
    let sliderX    = document.getElementById('camPosX');
    let sliderY    = document.getElementById('camPosY');

    // 1) 크기 (너비 기준, 4:3 비율 유지)
    // 슬라이더가 없으면 기본값 240 사용
    let camW = sliderSize ? parseInt(sliderSize.value) : 240;
    let camH = camW * 0.75; 

    // 2) 위치 (0~100% 비율을 화면 좌표로 변환)
    // p5.js WebGL 좌표계: 중앙이 (0,0)
    // X: -width/2 (왼쪽 끝) ~ width/2 - camW (오른쪽 끝)
    // Y: -height/2 (위쪽 끝) ~ height/2 - camH (아래쪽 끝)
    
    let valX = sliderX ? parseInt(sliderX.value) : 95; // 기본값 오른쪽
    let valY = sliderY ? parseInt(sliderY.value) : 5;  // 기본값 위쪽

    let minX = -width / 2;
    let maxX = (width / 2) - camW;
    let minY = -height / 2;
    let maxY = (height / 2) - camH;

    let posX = map(valX, 0, 100, minX, maxX);
    let posY = map(valY, 0, 100, minY, maxY);
    // ---------------------------------------------------------

    // [중요] Z축을 100만큼 주어 카메라 앞으로 당김 (맨 앞에 보이게 함)
    translate(posX, posY, 100);

    // 3. 배경 및 비디오 그리기
    fill(0, 150); // 배경 투명도 (0~255)
    noStroke();
    rect(0, 0, camW, camH); 

    if (this.video) {
      push();
      translate(camW, 0);
      scale(-1, 1); // 거울 모드 (좌우 반전)
      textureMode(NORMAL); 
      image(this.video, 0, 0, camW, camH);
      pop();
    }

    // 테두리
    stroke(255);
    strokeWeight(2);
    noFill();
    rect(0, 0, camW, camH);

    // 4. [인식 시각화] 뼈대와 관절 그리기
    if (this.hands.length > 0) {
      let hand = this.hands[0];
      
      // 화면 크기에 맞춰 스케일 조정 (원본 320x240 기준)
      let scaleX = camW / 320; 
      let scaleY = camH / 240; 

      // (A) 손가락 뼈대 연결선
      this.drawFinger(hand, [0, 1, 2, 3, 4], scaleX, scaleY);
      this.drawFinger(hand, [0, 5, 6, 7, 8], scaleX, scaleY);
      this.drawFinger(hand, [0, 9, 10, 11, 12], scaleX, scaleY);
      this.drawFinger(hand, [0, 13, 14, 15, 16], scaleX, scaleY);
      this.drawFinger(hand, [0, 17, 18, 19, 20], scaleX, scaleY);

      // (B) 모든 관절 점 찍기 (빨간점)
      for(let i=0; i<hand.keypoints.length; i++) {
        let p = hand.keypoints[i];
        fill(255, 0, 0);
        noStroke();
        // 화면이 작아지면 점 크기도 줄임
        let dotSize = camW < 150 ? 3 : 6;
        circle(p.x * scaleX, p.y * scaleY, dotSize);
      }
      
      // (C) 손가락 끝 강조 (초록점)
      let tips = [8, 12, 16, 20];
      for (let tipIdx of tips) {
        let p = hand.keypoints[tipIdx];
        fill(0, 255, 0);
        let tipSize = camW < 150 ? 5 : 10;
        circle(p.x * scaleX, p.y * scaleY, tipSize);
      }
    }

    pop();
  }

  // 뼈대 그리기 도우미 함수
  drawFinger(hand, indices, sx, sy) {
    stroke(0, 255, 0); // 초록색 뼈대
    strokeWeight(2);
    noFill();
    beginShape();
    for (let i of indices) {
      let p = hand.keypoints[i];
      vertex(p.x * sx, p.y * sy);
    }
    endShape();
  }
}