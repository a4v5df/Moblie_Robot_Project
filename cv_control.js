// ==========================================
// [cv_control.js] - Exact Alignment Fixed
// ==========================================

class HandController {
  constructor() {
    this.video = null;
    this.handPose = null;
    this.hands = [];
    this.isReady = false;

    // HTML 오버레이 요소 참조
    this.container = document.getElementById('cam-container');
    this.canvas = document.getElementById('overlay-canvas');
    // 2D 캔버스 컨텍스트 가져오기
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
  }

  init() {
    // 1. 웹캠 캡처 생성
    this.video = createCapture(VIDEO);
    this.video.size(320, 240);
    
    // [중요] 생성된 비디오 요소를 HTML 컨테이너 안으로 이동
    if (this.container) {
      this.video.parent('cam-container');
    }

    // 2. HandPose 모델 로드
    let options = {
      flipped: true, // [중요] 좌표계 반전 (CSS 비디오의 scaleX(-1)과 매칭됨)
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

    // --- 손가락 굽힘을 이용한 와이어 장력 계산 ---
    let wrist = hand.keypoints[0];
    let middleMCP = hand.keypoints[9];
    let palmSize = dist(wrist.x, wrist.y, middleMCP.x, middleMCP.y);
    
    if (palmSize < 10) return; 

    // 손가락 끝과 손목 사이 거리를 이용해 0.0~1.0 값 매핑
    const calculateTension = (tipIdx) => {
      let tip = hand.keypoints[tipIdx];
      let d = dist(wrist.x, wrist.y, tip.x, tip.y);
      let ratio = d / palmSize; 
      // 펼쳤을 때(1.8) ~ 주먹 쥐었을 때(0.7)
      return map(ratio, 1.8, 0.7, 0.0, 1.0, true);
    };

    // 전역 변수 업데이트
    window.wireUp    = calculateTension(8);  // 검지
    window.wireDown  = calculateTension(12); // 중지
    window.wireLeft  = calculateTension(16); // 약지
    window.wireRight = calculateTension(20); // 소지
  }

  // 화면 오버레이 그리기
  drawDebug() {
    // 1. UI 슬라이더 값 읽기
    let sliderSize = document.getElementById('camSize');
    let sliderX    = document.getElementById('camPosX');
    let sliderY    = document.getElementById('camPosY');

    // 2. HTML 컨테이너(캠 화면) 위치 및 크기 동적 업데이트
    if (this.container && sliderSize) {
      let w = parseInt(sliderSize.value);
      let h = w * 0.75; // 4:3 비율 유지

      let valX = sliderX ? parseInt(sliderX.value) : 95;
      let valY = sliderY ? parseInt(sliderY.value) : 5;
      
      let maxLeft = window.innerWidth - w;
      let maxTop = window.innerHeight - h;
      
      let left = map(valX, 0, 100, 0, maxLeft);
      let top  = map(valY, 0, 100, 0, maxTop);

      this.container.style.width = w + 'px';
      this.container.style.height = h + 'px';
      this.container.style.left = left + 'px';
      this.container.style.top = top + 'px';
    }

    // 3. 2D 오버레이 캔버스에 뼈대 그리기
    if (this.ctx && this.isReady) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      if (this.hands.length > 0) {
        let hand = this.hands[0];

        // 뼈대 선 그리기
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#00FF00'; // 초록색

        this.drawFinger2D(hand, [0, 1, 2, 3, 4]);       // 엄지
        this.drawFinger2D(hand, [0, 5, 6, 7, 8]);       // 검지
        this.drawFinger2D(hand, [0, 9, 10, 11, 12]);    // 중지
        this.drawFinger2D(hand, [0, 13, 14, 15, 16]);   // 약지
        this.drawFinger2D(hand, [0, 17, 18, 19, 20]);   // 소지

        // 관절 점 찍기 (빨간색)
        this.ctx.fillStyle = 'red';
        for(let p of hand.keypoints) {
           this.ctx.beginPath();
           this.ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
           this.ctx.fill();
        }
        
        // 손끝 강조 (초록색)
        let tips = [8, 12, 16, 20];
        this.ctx.fillStyle = '#00FF00';
        for (let idx of tips) {
            let p = hand.keypoints[idx];
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
            this.ctx.fill();
        }
      }
    }
  }

  drawFinger2D(hand, indices) {
    this.ctx.beginPath();
    let start = hand.keypoints[indices[0]];
    this.ctx.moveTo(start.x, start.y);
    
    for (let i = 1; i < indices.length; i++) {
      let p = hand.keypoints[indices[i]];
      this.ctx.lineTo(p.x, p.y);
    }
    this.ctx.stroke();
  }
}